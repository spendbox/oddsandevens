-- Follow-up to 0005:
--   * Reward redemption goes back to unique ONE-TIME codes per unlock — the
--     persistent per-customer reward code is retired. The cycling loyalty
--     code stays.
--   * rewards gain an optional free-text details blurb, shown to customers
--     in the play page's welcome popup.

-- ---------------------------------------------------------------------------
-- rewards: optional details
-- ---------------------------------------------------------------------------

alter table public.rewards
  add column details text check (char_length(details) <= 300);

-- ---------------------------------------------------------------------------
-- customer_merchant_state: retire the persistent reward code
-- ---------------------------------------------------------------------------

drop index if exists public.cms_reward_code_per_merchant;
alter table public.customer_merchant_state drop column if exists reward_code;

-- ---------------------------------------------------------------------------
-- generate_customer_code: only the loyalty-code namespace remains alongside
-- the global one-time redemption codes.
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
         where merchant_id = p_merchant_id and loyalty_code = v_code
      )
      and not exists (select 1 from unlocked_rewards where redemption_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- play_tile: same signature as 0005, but only the loyalty code is minted.
-- ---------------------------------------------------------------------------

create or replace function public.play_tile(
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

  -- Every customer carries a cycling loyalty code per merchant.
  if v_state.loyalty_code is null then
    update customer_merchant_state
       set loyalty_code = generate_customer_code(v_merchant.id)
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
-- lookup_staff_code: two namespaces now — the cycling loyalty code and the
-- one-time redemption codes minted per unlock.
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

  -- 2. One-time redemption code (a reward win or an old loyalty discount)
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
      'kind', 'code',
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
-- create_grid: rewards accept an optional details blurb.
-- ---------------------------------------------------------------------------

create or replace function public.create_grid(
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
  v_details text;
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
    v_details := left(nullif(trim(coalesce(v_reward->>'details', '')), ''), 300);

    insert into rewards (grid_id, description, details, expiry_days, max_redemptions)
    values (v_grid_id, v_reward->>'description', v_details, v_expiry_days, v_max_redemptions)
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

-- Dropped: redeem_unlocked_reward (the reward-code picker flow it served is
-- gone; one-time codes redeem via redeem_code).
drop function if exists public.redeem_unlocked_reward(uuid, uuid);
