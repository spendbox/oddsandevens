-- Puzzle-image grids, multiple grids for premium, Paystack payments, and the
-- admin image library.
--
--   * Grids gain a title, a reveal image, and a tile shape. Revealed tiles on
--     the play page uncover the matching slice of the image.
--   * Premium merchants can run several active grids at once (free stays at
--     one); play_tile / create_grid / redeem_code updated accordingly.
--   * grid_images: free image library curated in /admin.
--   * app_settings: admin-tunable settings (premium price in kobo).
--   * payments: Paystack transaction log for premium upgrades.
--   * merchants gain WhatsApp / contact email for the play page contact FAB.

-- ---------------------------------------------------------------------------
-- Merchant contact details (play-page floating action button)
-- ---------------------------------------------------------------------------

alter table public.merchants
  add column whatsapp text check (whatsapp ~ '^[0-9+][0-9 ]{5,19}$'),
  add column contact_email text check (contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- ---------------------------------------------------------------------------
-- Grid appearance
-- ---------------------------------------------------------------------------

alter table public.grids
  add column title text check (char_length(title) <= 80),
  add column image_url text,
  add column tile_shape text not null default 'square'
    check (tile_shape in ('square', 'circle', 'hexagon', 'diamond'));

-- Premium merchants may run several grids at once; the cap is enforced in
-- create_grid (free: 1 active, premium: 5 active).
drop index if exists public.grids_one_active_per_merchant;

-- ---------------------------------------------------------------------------
-- Admin image library, settings, payments
-- ---------------------------------------------------------------------------

create table public.grid_images (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Merchants browse the active library when building a grid.
alter table public.grid_images enable row level security;
grant select on public.grid_images to authenticated;
create policy grid_images_active_select on public.grid_images
  for select to authenticated
  using (is_active);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
-- Service role only: price is served through API routes.

insert into public.app_settings (key, value)
values ('premium_price_kobo', to_jsonb(500000))
on conflict (key) do nothing;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  reference text not null unique,
  amount_kobo int not null check (amount_kobo > 0),
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index payments_merchant_idx on public.payments (merchant_id, created_at desc);
alter table public.payments enable row level security;
-- Service role only.

-- Storage buckets: free library images + premium custom grid images.
insert into storage.buckets (id, name, public)
values ('grid-images', 'grid-images', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- play_tile: now targets a specific grid (a merchant can have several).
-- Cooldown stays per-merchant: one play per cooldown across all their grids.
-- ---------------------------------------------------------------------------

drop function if exists public.play_tile(text, int, int, text);

create function public.play_tile(
  p_slug text,
  p_grid_id uuid,
  p_row int,
  p_col int,
  p_email text
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
  v_tile tiles%rowtype;
  v_reward rewards%rowtype;
  v_claimed int;
  v_code text;
  v_expires_at timestamptz;
  v_points int;
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

  if v_state.last_played_at is not null
     and v_state.last_played_at > now() - interval '10 hours' then
    return jsonb_build_object(
      'result', 'cooldown',
      'next_play_at', v_state.last_played_at + interval '10 hours',
      'loyalty_points', v_state.loyalty_points
    );
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
     set last_played_at = now()
   where customer_id = v_customer_id and merchant_id = v_merchant.id;

  if v_tile.reward_id is not null then
    -- Lock the reward row so concurrent hits can't over-claim max_redemptions.
    select * into v_reward from rewards where id = v_tile.reward_id for update;
    select count(*) into v_claimed from unlocked_rewards where reward_id = v_reward.id;

    if v_claimed < v_reward.max_redemptions then
      v_code := generate_redemption_code();
      v_expires_at := now() + make_interval(hours => v_reward.expiry_hours);

      insert into unlocked_rewards
        (customer_id, merchant_id, reward_id, reward_type, redemption_code, expires_at)
      values
        (v_customer_id, v_merchant.id, v_reward.id, 'tile', v_code, v_expires_at);

      return jsonb_build_object(
        'result', 'hit',
        'description', v_reward.description,
        'code', v_code,
        'expires_at', v_expires_at
      );
    end if;
    -- Reward exhausted: fall through and treat as a miss.
  end if;

  update customer_merchant_state
     set loyalty_points = loyalty_points + 1
   where customer_id = v_customer_id and merchant_id = v_merchant.id
   returning loyalty_points into v_points;

  return jsonb_build_object('result', 'miss', 'loyalty_points', v_points);
end;
$$;

revoke execute on function public.play_tile(text, uuid, int, int, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_grid: gains title / image / tile shape. Free tier: exactly one
-- active grid (creating a new one archives the old), square tiles only.
-- Premium: up to 5 active grids side by side, any tile shape.
-- ---------------------------------------------------------------------------

drop function if exists public.create_grid(uuid, int, int, jsonb);

create function public.create_grid(
  p_merchant_id uuid,
  p_rows int,
  p_cols int,
  p_rewards jsonb,
  p_title text default null,
  p_image_url text default null,
  p_tile_shape text default 'square'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchant merchants%rowtype;
  v_grid_id uuid;
  v_reward jsonb;
  v_reward_id uuid;
  v_reward_count int;
  v_tile_budget int;
  v_max_redemptions int;
  v_expiry_hours int;
  v_active_count int;
  v_shape text;
begin
  select * into v_merchant from merchants where id = p_merchant_id for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'merchant_not_found');
  end if;

  v_reward_count := coalesce(jsonb_array_length(p_rewards), 0);
  v_shape := coalesce(nullif(trim(p_tile_shape), ''), 'square');

  if v_shape not in ('square', 'circle', 'hexagon', 'diamond') then
    return jsonb_build_object('result', 'error', 'error', 'invalid_tile_shape');
  end if;

  if v_merchant.subscription_tier = 'free' then
    if p_rows <> 5 or p_cols <> 5 then
      return jsonb_build_object('result', 'error', 'error', 'grid_size_not_allowed');
    end if;
    if v_reward_count > 2 then
      return jsonb_build_object('result', 'error', 'error', 'too_many_rewards');
    end if;
    if v_shape <> 'square' then
      return jsonb_build_object('result', 'error', 'error', 'shape_requires_premium');
    end if;
    -- Free tier keeps the classic behaviour: new grid replaces the old one.
    update grids set status = 'archived'
     where merchant_id = p_merchant_id and status = 'active';
  else
    if p_rows < 5 or p_rows > 20 or p_cols < 5 or p_cols > 20 then
      return jsonb_build_object('result', 'error', 'error', 'grid_size_not_allowed');
    end if;
    if v_reward_count > 10 then
      return jsonb_build_object('result', 'error', 'error', 'too_many_rewards');
    end if;
    select count(*) into v_active_count from grids
     where merchant_id = p_merchant_id and status = 'active';
    if v_active_count >= 5 then
      return jsonb_build_object('result', 'error', 'error', 'too_many_active_grids');
    end if;
  end if;

  if v_reward_count < 1 then
    return jsonb_build_object('result', 'error', 'error', 'no_rewards');
  end if;

  -- Every reward occupies max_redemptions tiles; they all have to fit.
  select coalesce(sum(greatest((r->>'max_redemptions')::int, 1)), 0)
    into v_tile_budget
    from jsonb_array_elements(p_rewards) r;
  if v_tile_budget > p_rows * p_cols then
    return jsonb_build_object('result', 'error', 'error', 'rewards_exceed_tiles');
  end if;

  insert into grids (merchant_id, rows, cols, title, image_url, tile_shape)
  values (p_merchant_id, p_rows, p_cols, nullif(trim(p_title), ''), p_image_url, v_shape)
  returning id into v_grid_id;

  insert into tiles (grid_id, row_index, col_index)
  select v_grid_id, r, c
    from generate_series(0, p_rows - 1) r,
         generate_series(0, p_cols - 1) c;

  for v_reward in select * from jsonb_array_elements(p_rewards)
  loop
    v_expiry_hours := coalesce((v_reward->>'expiry_hours')::int, 48);
    v_max_redemptions := greatest(coalesce((v_reward->>'max_redemptions')::int, 1), 1);

    insert into rewards (grid_id, description, expiry_hours, max_redemptions)
    values (v_grid_id, v_reward->>'description', v_expiry_hours, v_max_redemptions)
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

revoke execute on function public.create_grid(uuid, int, int, jsonb, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- redeem_code: with multiple grids, shuffle the grid the redeemed reward
-- belongs to (not "the" active grid).
-- ---------------------------------------------------------------------------

create or replace function public.redeem_code(
  p_merchant_id uuid,
  p_code text
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
  v_reward_ids uuid[];
  v_rid uuid;
begin
  select * into v_ur from unlocked_rewards
   where redemption_code = upper(trim(p_code)) and merchant_id = p_merchant_id
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

    -- Shuffle the hidden reward tiles of the grid this reward lives on,
    -- provided that grid is still active.
    select g.id into v_grid_id
      from rewards r
      join grids g on g.id = r.grid_id and g.status = 'active'
     where r.id = v_ur.reward_id;
    if v_grid_id is not null then
      select array_agg(reward_id) into v_reward_ids
        from tiles
       where grid_id = v_grid_id and reward_id is not null and is_revealed = false;

      if v_reward_ids is not null then
        update tiles set reward_id = null
         where grid_id = v_grid_id and reward_id is not null and is_revealed = false;

        foreach v_rid in array v_reward_ids
        loop
          update tiles set reward_id = v_rid
           where id = (
             select id from tiles
              where grid_id = v_grid_id and is_revealed = false and reward_id is null
              order by random()
              limit 1
           );
        end loop;
      end if;
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
