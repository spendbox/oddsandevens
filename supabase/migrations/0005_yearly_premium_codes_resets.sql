-- Yearly premium, expiring loyalty points, persistent customer codes,
-- fixed 7x7 grids with interlocking shapes, grid completion cooldown +
-- auto-reset cycles, reward validity in days, and IP-based play limiting.
--
--   * merchants.premium_expires_at: premium now lasts 365 days per payment.
--   * customer_merchant_state gains a rolling points expiry (every play
--     extends the whole balance by 7 days), a total_plays counter, and two
--     persistent per-merchant codes: loyalty_code (cycles after each staff
--     redemption) and reward_code (never cycles).
--   * grids are always 7x7 from now on (legacy sizes stay playable), the
--     shape set becomes square / interlock-sharp / interlock-curved, and a
--     completed grid rests for reset_days (free: 7, premium: 7-365) before
--     maybe_reset_grid() starts a fresh cycle.
--   * unlocked_rewards.grid_cycle scopes reward stock to the current cycle
--     so historical rows keep lifetime stats intact.
--   * rewards.expiry_days replaces expiry_hours.
--   * play_ip_state enforces the 10-hour cooldown per hashed IP as well as
--     per email.

-- ---------------------------------------------------------------------------
-- merchants: yearly premium
-- ---------------------------------------------------------------------------

alter table public.merchants add column premium_expires_at timestamptz;

-- Grandfather existing premium merchants with a full year from today.
update public.merchants
   set premium_expires_at = now() + interval '365 days'
 where subscription_tier = 'premium';

-- ---------------------------------------------------------------------------
-- customer_merchant_state: points expiry, play counter, persistent codes
-- ---------------------------------------------------------------------------

alter table public.customer_merchant_state
  add column points_expire_at timestamptz,
  add column total_plays int not null default 0,
  add column loyalty_code text check (loyalty_code ~ '^[A-Z0-9]{6}$'),
  add column reward_code text check (reward_code ~ '^[A-Z0-9]{6}$');

create unique index cms_loyalty_code_per_merchant
  on public.customer_merchant_state (merchant_id, loyalty_code)
  where loyalty_code is not null;
create unique index cms_reward_code_per_merchant
  on public.customer_merchant_state (merchant_id, reward_code)
  where reward_code is not null;

-- Backfill total_plays from tiles revealed so far (lossy after resets, which
-- is why the counter exists going forward).
update public.customer_merchant_state s
   set total_plays = sub.n
  from (
    select t.revealed_by_customer_id as cid, g.merchant_id as mid, count(*) as n
      from public.tiles t
      join public.grids g on g.id = t.grid_id
     where t.revealed_by_customer_id is not null
     group by 1, 2
  ) sub
 where s.customer_id = sub.cid and s.merchant_id = sub.mid;

-- ---------------------------------------------------------------------------
-- grids: shape set, completion cooldown, reset cycles
-- ---------------------------------------------------------------------------

-- Retire circle/hexagon/diamond; existing grids fall back to square.
update public.grids
   set tile_shape = 'square'
 where tile_shape in ('circle', 'hexagon', 'diamond');

-- The old shape check was added inline in 0004, so its name is
-- auto-generated; find and drop it dynamically.
do $$
declare
  v_name text;
begin
  select conname into v_name
    from pg_constraint
   where conrelid = 'public.grids'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%tile_shape%';
  if v_name is not null then
    execute format('alter table public.grids drop constraint %I', v_name);
  end if;
end $$;

alter table public.grids add constraint grids_tile_shape_check
  check (tile_shape in ('square', 'interlock-sharp', 'interlock-curved'));

alter table public.grids
  add column completed_at timestamptz,
  add column reset_days int not null default 7 check (reset_days between 7 and 365),
  add column cycle int not null default 1;

-- ---------------------------------------------------------------------------
-- rewards: validity in days instead of hours
-- ---------------------------------------------------------------------------

alter table public.rewards
  add column expiry_days int not null default 2 check (expiry_days between 1 and 60);

update public.rewards
   set expiry_days = least(greatest(ceil(expiry_hours / 24.0)::int, 1), 60);

alter table public.rewards drop column expiry_hours;

-- ---------------------------------------------------------------------------
-- unlocked_rewards: scope claims to a grid cycle
-- ---------------------------------------------------------------------------

alter table public.unlocked_rewards
  add column grid_cycle int not null default 1;

create index unlocked_rewards_reward_cycle_idx
  on public.unlocked_rewards (reward_id, grid_cycle);

-- ---------------------------------------------------------------------------
-- play_ip_state: 10h cooldown per hashed IP per merchant (service role only)
-- ---------------------------------------------------------------------------

create table public.play_ip_state (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  ip_hash text not null,
  last_played_at timestamptz not null,
  primary key (merchant_id, ip_hash)
);
alter table public.play_ip_state enable row level security;
-- No client policies: service role only.

-- ---------------------------------------------------------------------------
-- generate_customer_code: mints a code that is unique across BOTH persistent
-- code columns for the merchant AND all one-time redemption codes globally,
-- so the single staff input box is never ambiguous about what was typed.
-- ---------------------------------------------------------------------------

create or replace function public.generate_customer_code(p_merchant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
      into v_code
      from generate_series(1, 6);
    exit when
      not exists (
        select 1 from customer_merchant_state
         where merchant_id = p_merchant_id
           and (loyalty_code = v_code or reward_code = v_code)
      )
      and not exists (select 1 from unlocked_rewards where redemption_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Backfill persistent codes for existing customer/merchant pairs.
do $$
declare
  r record;
begin
  for r in
    select customer_id, merchant_id from customer_merchant_state
     where loyalty_code is null or reward_code is null
  loop
    update customer_merchant_state
       set loyalty_code = coalesce(loyalty_code, generate_customer_code(r.merchant_id)),
           reward_code = coalesce(reward_code, generate_customer_code(r.merchant_id))
     where customer_id = r.customer_id and merchant_id = r.merchant_id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- shuffle_grid_rewards: re-deal the still-hidden reward tiles of a grid
-- (extracted from redeem_code so the new staff redemption path reuses it).
-- ---------------------------------------------------------------------------

create or replace function public.shuffle_grid_rewards(p_grid_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward_ids uuid[];
  v_rid uuid;
begin
  select array_agg(reward_id) into v_reward_ids
    from tiles
   where grid_id = p_grid_id and reward_id is not null and is_revealed = false;

  if v_reward_ids is null then
    return;
  end if;

  update tiles set reward_id = null
   where grid_id = p_grid_id and reward_id is not null and is_revealed = false;

  foreach v_rid in array v_reward_ids
  loop
    update tiles set reward_id = v_rid
     where id = (
       select id from tiles
        where grid_id = p_grid_id and is_revealed = false and reward_id is null
        order by random()
        limit 1
     );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- maybe_reset_grid: lazy auto-reset once the completion cooldown has passed.
-- Starts a new cycle: hides every tile and re-deals full reward stock.
-- Returns true when a reset happened.
-- ---------------------------------------------------------------------------

create or replace function public.maybe_reset_grid(p_grid_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grid grids%rowtype;
  v_reward rewards%rowtype;
begin
  select * into v_grid from grids where id = p_grid_id for update;
  if not found
     or v_grid.status <> 'active'
     or v_grid.completed_at is null
     or now() < v_grid.completed_at + make_interval(days => v_grid.reset_days) then
    return false;
  end if;

  update grids
     set cycle = cycle + 1,
         completed_at = null
   where id = p_grid_id;

  update tiles
     set is_revealed = false,
         revealed_by_customer_id = null,
         revealed_at = null,
         reward_id = null
   where grid_id = p_grid_id;

  for v_reward in select * from rewards where grid_id = p_grid_id
  loop
    update tiles set reward_id = v_reward.id
     where id in (
       select id from tiles
        where grid_id = p_grid_id and reward_id is null
        order by random()
        limit v_reward.max_redemptions
     );
  end loop;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- play_tile: adds IP cooldown, rolling points expiry, persistent code
-- minting, per-cycle stock accounting, and completion detection.
-- ---------------------------------------------------------------------------

drop function if exists public.play_tile(text, uuid, int, int, text);

create function public.play_tile(
  p_slug text,
  p_grid_id uuid,
  p_row int,
  p_col int,
  p_email text,
  p_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchant merchants%rowtype;
  v_grid grids%rowtype;
  v_customer_id uuid;
  v_state customer_merchant_state%rowtype;
  v_ip play_ip_state%rowtype;
  v_tile tiles%rowtype;
  v_reward rewards%rowtype;
  v_claimed int;
  v_code text;
  v_expires_at timestamptz;
  v_result jsonb;
  v_stock_remaining int;
  v_unrevealed int;
begin
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('result', 'error', 'error', 'invalid_email');
  end if;

  select * into v_merchant from merchants where slug = lower(trim(p_slug));
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'merchant_not_found');
  end if;

  select * into v_grid from grids
   where id = p_grid_id and merchant_id = v_merchant.id and status = 'active';
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'no_active_grid');
  end if;

  -- A completed grid may be due for its automatic reset.
  if v_grid.completed_at is not null then
    perform maybe_reset_grid(v_grid.id);
    select * into v_grid from grids where id = v_grid.id;
    if v_grid.completed_at is not null then
      return jsonb_build_object(
        'result', 'grid_completed',
        'resets_at', v_grid.completed_at + make_interval(days => v_grid.reset_days)
      );
    end if;
  end if;

  insert into customers (email)
  values (lower(trim(p_email)))
  on conflict (email) do update set email = excluded.email
  returning id into v_customer_id;

  insert into customer_merchant_state (customer_id, merchant_id)
  values (v_customer_id, v_merchant.id)
  on conflict (customer_id, merchant_id) do nothing;

  select * into v_state from customer_merchant_state
   where customer_id = v_customer_id and merchant_id = v_merchant.id
   for update;

  -- Every customer carries two persistent codes per merchant.
  if v_state.loyalty_code is null or v_state.reward_code is null then
    update customer_merchant_state
       set loyalty_code = coalesce(loyalty_code, generate_customer_code(v_merchant.id)),
           reward_code = coalesce(reward_code, generate_customer_code(v_merchant.id))
     where customer_id = v_customer_id and merchant_id = v_merchant.id
     returning * into v_state;
  end if;

  -- Rolling expiry: a balance untouched for 7 days is gone.
  if v_state.points_expire_at is not null and v_state.points_expire_at < now() then
    update customer_merchant_state
       set loyalty_points = 0, points_expire_at = null
     where customer_id = v_customer_id and merchant_id = v_merchant.id
     returning * into v_state;
  end if;

  if v_state.last_played_at is not null
     and v_state.last_played_at > now() - interval '10 hours' then
    return jsonb_build_object(
      'result', 'cooldown',
      'next_play_at', v_state.last_played_at + interval '10 hours',
      'loyalty_points', v_state.loyalty_points,
      'points_expire_at', v_state.points_expire_at
    );
  end if;

  -- Same cooldown keyed by hashed IP, so swapping emails doesn't help.
  if p_ip_hash is not null and length(p_ip_hash) > 0 then
    select * into v_ip from play_ip_state
     where merchant_id = v_merchant.id and ip_hash = p_ip_hash
     for update;
    if found and v_ip.last_played_at > now() - interval '10 hours' then
      return jsonb_build_object(
        'result', 'cooldown',
        'next_play_at', v_ip.last_played_at + interval '10 hours',
        'loyalty_points', v_state.loyalty_points,
        'points_expire_at', v_state.points_expire_at
      );
    end if;
  end if;

  select * into v_tile from tiles
   where grid_id = v_grid.id and row_index = p_row and col_index = p_col
   for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'invalid_tile');
  end if;

  if v_tile.is_revealed then
    return jsonb_build_object('result', 'error', 'error', 'tile_taken');
  end if;

  update tiles
     set is_revealed = true,
         revealed_by_customer_id = v_customer_id,
         revealed_at = now()
   where id = v_tile.id;

  update customer_merchant_state
     set last_played_at = now(),
         total_plays = total_plays + 1
   where customer_id = v_customer_id and merchant_id = v_merchant.id;

  if p_ip_hash is not null and length(p_ip_hash) > 0 then
    insert into play_ip_state (merchant_id, ip_hash, last_played_at)
    values (v_merchant.id, p_ip_hash, now())
    on conflict (merchant_id, ip_hash) do update set last_played_at = now();
  end if;

  if v_tile.reward_id is not null then
    -- Lock the reward row so concurrent hits can't over-claim max_redemptions.
    select * into v_reward from rewards where id = v_tile.reward_id for update;
    select count(*) into v_claimed from unlocked_rewards
     where reward_id = v_reward.id and grid_cycle = v_grid.cycle;

    if v_claimed < v_reward.max_redemptions then
      v_code := generate_redemption_code();
      v_expires_at := now() + make_interval(days => v_reward.expiry_days);

      insert into unlocked_rewards
        (customer_id, merchant_id, reward_id, reward_type, redemption_code,
         expires_at, grid_cycle)
      values
        (v_customer_id, v_merchant.id, v_reward.id, 'tile', v_code,
         v_expires_at, v_grid.cycle);

      v_result := jsonb_build_object(
        'result', 'hit',
        'description', v_reward.description,
        'code', v_code,
        'expires_at', v_expires_at
      );
    end if;
    -- Reward exhausted: fall through and treat as a miss.
  end if;

  if v_result is null then
    -- Miss: +1 point, and the whole balance stays alive another 7 days.
    update customer_merchant_state
       set loyalty_points = loyalty_points + 1,
           points_expire_at = now() + interval '7 days'
     where customer_id = v_customer_id and merchant_id = v_merchant.id
     returning * into v_state;

    v_result := jsonb_build_object(
      'result', 'miss',
      'loyalty_points', v_state.loyalty_points,
      'points_expire_at', v_state.points_expire_at
    );
  end if;

  -- Completion check: no stock left (this cycle) or no tiles left to flip.
  select coalesce(sum(greatest(r.max_redemptions - (
           select count(*) from unlocked_rewards ur
            where ur.reward_id = r.id and ur.grid_cycle = v_grid.cycle
         ), 0)), 0)
    into v_stock_remaining
    from rewards r
   where r.grid_id = v_grid.id;

  select count(*) into v_unrevealed
    from tiles where grid_id = v_grid.id and is_revealed = false;

  if v_stock_remaining <= 0 or v_unrevealed = 0 then
    update grids set completed_at = now()
     where id = v_grid.id and completed_at is null;
    v_result := v_result || jsonb_build_object(
      'grid_completed', true,
      'resets_at', now() + make_interval(days => v_grid.reset_days)
    );
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_grid: grids are always 7x7 now. Premium is only effective while
-- premium_expires_at is in the future; lapsed merchants act as free for new
-- grids. Premium may run up to 10 active grids and pick a reset cooldown of
-- 7-365 days; free stays at one active grid with the fixed 7-day reset.
-- ---------------------------------------------------------------------------

drop function if exists public.create_grid(uuid, int, int, jsonb, text, text, text);

create function public.create_grid(
  p_merchant_id uuid,
  p_rewards jsonb,
  p_title text default null,
  p_image_url text default null,
  p_tile_shape text default 'square',
  p_reset_days int default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchant merchants%rowtype;
  v_is_premium boolean;
  v_grid_id uuid;
  v_reward jsonb;
  v_reward_id uuid;
  v_reward_count int;
  v_tile_budget int;
  v_max_redemptions int;
  v_expiry_days int;
  v_active_count int;
  v_shape text;
  v_reset_days int;
begin
  select * into v_merchant from merchants where id = p_merchant_id for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'merchant_not_found');
  end if;

  v_is_premium := v_merchant.subscription_tier = 'premium'
    and v_merchant.premium_expires_at is not null
    and v_merchant.premium_expires_at > now();

  v_reward_count := coalesce(jsonb_array_length(p_rewards), 0);
  v_shape := coalesce(nullif(trim(p_tile_shape), ''), 'square');
  v_reset_days := coalesce(p_reset_days, 7);

  if v_shape not in ('square', 'interlock-sharp', 'interlock-curved') then
    return jsonb_build_object('result', 'error', 'error', 'invalid_tile_shape');
  end if;

  if not v_is_premium then
    if v_reward_count > 2 then
      return jsonb_build_object('result', 'error', 'error', 'too_many_rewards');
    end if;
    if v_shape <> 'square' then
      return jsonb_build_object('result', 'error', 'error', 'shape_requires_premium');
    end if;
    -- Free tier keeps the classic behaviour: new grid replaces the old one,
    -- and the reset cooldown is fixed at 7 days.
    v_reset_days := 7;
    update grids set status = 'archived'
     where merchant_id = p_merchant_id and status = 'active';
  else
    if v_reward_count > 10 then
      return jsonb_build_object('result', 'error', 'error', 'too_many_rewards');
    end if;
    if v_reset_days < 7 or v_reset_days > 365 then
      return jsonb_build_object('result', 'error', 'error', 'invalid_reset_days');
    end if;
    select count(*) into v_active_count from grids
     where merchant_id = p_merchant_id and status = 'active';
    if v_active_count >= 10 then
      return jsonb_build_object('result', 'error', 'error', 'too_many_active_grids');
    end if;
  end if;

  if v_reward_count < 1 then
    return jsonb_build_object('result', 'error', 'error', 'no_rewards');
  end if;

  -- Every reward occupies max_redemptions tiles; they all have to fit in 7x7.
  select coalesce(sum(greatest((r->>'max_redemptions')::int, 1)), 0)
    into v_tile_budget
    from jsonb_array_elements(p_rewards) r;
  if v_tile_budget > 49 then
    return jsonb_build_object('result', 'error', 'error', 'rewards_exceed_tiles');
  end if;

  insert into grids (merchant_id, rows, cols, title, image_url, tile_shape, reset_days)
  values (p_merchant_id, 7, 7, nullif(trim(p_title), ''), p_image_url, v_shape, v_reset_days)
  returning id into v_grid_id;

  insert into tiles (grid_id, row_index, col_index)
  select v_grid_id, r, c
    from generate_series(0, 6) r,
         generate_series(0, 6) c;

  for v_reward in select * from jsonb_array_elements(p_rewards)
  loop
    v_expiry_days := least(greatest(coalesce((v_reward->>'expiry_days')::int, 2), 1), 60);
    v_max_redemptions := greatest(coalesce((v_reward->>'max_redemptions')::int, 1), 1);

    insert into rewards (grid_id, description, expiry_days, max_redemptions)
    values (v_grid_id, v_reward->>'description', v_expiry_days, v_max_redemptions)
    returning id into v_reward_id;

    update tiles set reward_id = v_reward_id
     where id in (
       select id from tiles
        where grid_id = v_grid_id and reward_id is null
        order by random()
        limit v_max_redemptions
     );
  end loop;

  return jsonb_build_object('result', 'created', 'grid_id', v_grid_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- lookup_staff_code: resolves whatever the staff typed. Priority: the
-- customer's cycling loyalty code, then their fixed reward code, then a
-- legacy one-time redemption code. generate_customer_code guarantees the
-- three namespaces never collide.
-- ---------------------------------------------------------------------------

create or replace function public.lookup_staff_code(
  p_merchant_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_merchant merchants%rowtype;
  v_state customer_merchant_state%rowtype;
  v_email text;
  v_rewards jsonb;
  v_ur unlocked_rewards%rowtype;
  v_description text;
begin
  v_code := upper(trim(p_code));
  if v_code !~ '^[A-Z0-9]{6}$' then
    return jsonb_build_object('result', 'error', 'error', 'code_not_found');
  end if;

  select * into v_merchant from merchants where id = p_merchant_id;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'merchant_not_found');
  end if;

  -- 1. Cycling loyalty code
  select * into v_state from customer_merchant_state
   where merchant_id = p_merchant_id and loyalty_code = v_code
   for update;
  if found then
    if v_state.points_expire_at is not null and v_state.points_expire_at < now() then
      update customer_merchant_state
         set loyalty_points = 0, points_expire_at = null
       where customer_id = v_state.customer_id and merchant_id = p_merchant_id
       returning * into v_state;
    end if;
    select email into v_email from customers where id = v_state.customer_id;
    return jsonb_build_object(
      'result', 'found',
      'kind', 'loyalty',
      'customer_email', v_email,
      'points', v_state.loyalty_points,
      'points_needed', v_merchant.points_per_discount,
      'discount_percent', v_merchant.discount_percent,
      'eligible', v_state.loyalty_points >= v_merchant.points_per_discount,
      'points_expire_at', v_state.points_expire_at
    );
  end if;

  -- 2. Fixed reward code: list the customer's live unlocked rewards.
  select * into v_state from customer_merchant_state
   where merchant_id = p_merchant_id and reward_code = v_code;
  if found then
    -- Lazily flip anything stale before listing.
    update unlocked_rewards
       set status = 'expired'
     where customer_id = v_state.customer_id
       and merchant_id = p_merchant_id
       and status = 'unredeemed'
       and expires_at < now();

    select email into v_email from customers where id = v_state.customer_id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'unlocked_id', ur.id,
             'description', coalesce(r.description,
               case when ur.reward_type = 'loyalty_discount'
                    then ur.discount_percent || '% loyalty discount'
                    else 'Tile reward' end),
             'reward_type', ur.reward_type,
             'discount_percent', ur.discount_percent,
             'unlocked_at', ur.unlocked_at,
             'expires_at', ur.expires_at
           ) order by ur.expires_at asc), '[]'::jsonb)
      into v_rewards
      from unlocked_rewards ur
      left join rewards r on r.id = ur.reward_id
     where ur.customer_id = v_state.customer_id
       and ur.merchant_id = p_merchant_id
       and ur.status = 'unredeemed';

    return jsonb_build_object(
      'result', 'found',
      'kind', 'reward',
      'customer_email', v_email,
      'rewards', v_rewards
    );
  end if;

  -- 3. Legacy one-time redemption code
  select * into v_ur from unlocked_rewards
   where redemption_code = v_code and merchant_id = p_merchant_id;
  if found then
    if v_ur.reward_type = 'tile' then
      select description into v_description from rewards where id = v_ur.reward_id;
      v_description := coalesce(v_description, 'Tile reward');
    else
      v_description := v_ur.discount_percent || '% loyalty discount';
    end if;
    select email into v_email from customers where id = v_ur.customer_id;
    return jsonb_build_object(
      'result', 'found',
      'kind', 'legacy',
      'customer_email', v_email,
      'description', v_description,
      'status', case
        when v_ur.status = 'unredeemed' and v_ur.expires_at < now() then 'expired'
        else v_ur.status
      end,
      'expires_at', v_ur.expires_at
    );
  end if;

  return jsonb_build_object('result', 'error', 'error', 'code_not_found');
end;
$$;

-- ---------------------------------------------------------------------------
-- redeem_loyalty_by_code: staff redeem a customer's points-discount via the
-- loyalty code. Burns points_per_discount points, records a redeemed audit
-- row, and CYCLES the loyalty code so it can't be replayed.
-- ---------------------------------------------------------------------------

create or replace function public.redeem_loyalty_by_code(
  p_merchant_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchant merchants%rowtype;
  v_state customer_merchant_state%rowtype;
  v_email text;
  v_new_code text;
begin
  select * into v_merchant from merchants where id = p_merchant_id;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'merchant_not_found');
  end if;

  select * into v_state from customer_merchant_state
   where merchant_id = p_merchant_id and loyalty_code = upper(trim(p_code))
   for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'code_not_found');
  end if;

  if v_state.points_expire_at is not null and v_state.points_expire_at < now() then
    update customer_merchant_state
       set loyalty_points = 0, points_expire_at = null
     where customer_id = v_state.customer_id and merchant_id = p_merchant_id
     returning * into v_state;
  end if;

  if v_state.loyalty_points < v_merchant.points_per_discount then
    return jsonb_build_object(
      'result', 'error',
      'error', 'insufficient_points',
      'points', v_state.loyalty_points,
      'points_needed', v_merchant.points_per_discount
    );
  end if;

  v_new_code := generate_customer_code(p_merchant_id);

  update customer_merchant_state
     set loyalty_points = loyalty_points - v_merchant.points_per_discount,
         loyalty_code = v_new_code
   where customer_id = v_state.customer_id and merchant_id = p_merchant_id
   returning * into v_state;

  -- Audit row so redemptions show up in stats and the unlocks list.
  insert into unlocked_rewards
    (customer_id, merchant_id, reward_type, discount_percent, redemption_code,
     status, expires_at, redeemed_at)
  values
    (v_state.customer_id, p_merchant_id, 'loyalty_discount',
     v_merchant.discount_percent, generate_redemption_code(),
     'redeemed', now(), now());

  select email into v_email from customers where id = v_state.customer_id;

  return jsonb_build_object(
    'result', 'loyalty_redeemed',
    'discount_percent', v_merchant.discount_percent,
    'customer_email', v_email,
    'points_remaining', v_state.loyalty_points,
    'points_expire_at', v_state.points_expire_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- redeem_unlocked_reward: staff redeem one specific unlocked reward chosen
-- from the reward-code lookup list. The reward code itself never cycles.
-- ---------------------------------------------------------------------------

create or replace function public.redeem_unlocked_reward(
  p_merchant_id uuid,
  p_unlocked_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ur unlocked_rewards%rowtype;
  v_description text;
  v_email text;
  v_grid_id uuid;
begin
  select * into v_ur from unlocked_rewards
   where id = p_unlocked_id and merchant_id = p_merchant_id
   for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'code_not_found');
  end if;

  if v_ur.status = 'redeemed' then
    return jsonb_build_object('result', 'error', 'error', 'already_redeemed');
  end if;

  if v_ur.status = 'expired' or v_ur.expires_at < now() then
    update unlocked_rewards set status = 'expired' where id = v_ur.id;
    return jsonb_build_object('result', 'error', 'error', 'expired');
  end if;

  update unlocked_rewards
     set status = 'redeemed', redeemed_at = now()
   where id = v_ur.id;

  if v_ur.reward_type = 'tile' then
    select description into v_description from rewards where id = v_ur.reward_id;
    v_description := coalesce(v_description, 'Tile reward');

    -- Anti-collusion: re-deal the hidden reward tiles of that grid.
    select g.id into v_grid_id
      from rewards r
      join grids g on g.id = r.grid_id and g.status = 'active'
     where r.id = v_ur.reward_id;
    if v_grid_id is not null then
      perform shuffle_grid_rewards(v_grid_id);
    end if;
  else
    v_description := v_ur.discount_percent || '% loyalty discount';
  end if;

  select email into v_email from customers where id = v_ur.customer_id;

  return jsonb_build_object(
    'result', 'redeemed',
    'description', v_description,
    'reward_type', v_ur.reward_type,
    'discount_percent', v_ur.discount_percent,
    'customer_email', v_email,
    'unlocked_at', v_ur.unlocked_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Retired: customer self-serve points redemption. Loyalty discounts are now
-- redeemed at the counter via the cycling loyalty code.
-- ---------------------------------------------------------------------------

drop function if exists public.redeem_loyalty_points(text, text);

-- ---------------------------------------------------------------------------
-- Lock down every new/changed signature (service role only).
-- ---------------------------------------------------------------------------

revoke execute on function public.generate_customer_code(uuid) from public, anon, authenticated;
revoke execute on function public.shuffle_grid_rewards(uuid) from public, anon, authenticated;
revoke execute on function public.maybe_reset_grid(uuid) from public, anon, authenticated;
revoke execute on function public.play_tile(text, uuid, int, int, text, text) from public, anon, authenticated;
revoke execute on function public.create_grid(uuid, jsonb, text, text, text, int) from public, anon, authenticated;
revoke execute on function public.lookup_staff_code(uuid, text) from public, anon, authenticated;
revoke execute on function public.redeem_loyalty_by_code(uuid, text) from public, anon, authenticated;
revoke execute on function public.redeem_unlocked_reward(uuid, uuid) from public, anon, authenticated;
