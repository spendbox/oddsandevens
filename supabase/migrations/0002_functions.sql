-- TileHunt game logic. Every mutation that must be atomic lives here as a
-- SECURITY DEFINER function running in a single transaction with row locks,
-- called via RPC from Next.js API routes using the service-role key.
--
-- Game constants baked into these functions (mirrored in src/lib/constants.ts):
--   * Cooldown after any play: 10 hours
--   * Loyalty exchange: 3 points -> one 2% discount code
--   * Loyalty discount code lifetime: 168 hours (7 days)

-- ---------------------------------------------------------------------------
-- Redemption code generator: 6 chars, ambiguity-free alphabet (no 0/O/1/I/L).
-- ---------------------------------------------------------------------------
create or replace function public.generate_redemption_code()
returns text
language plpgsql
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
    exit when not exists (select 1 from unlocked_rewards where redemption_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- play_tile: the critical path. One transaction, two row locks:
--   1. customer_merchant_state FOR UPDATE serializes plays per customer.
--   2. tiles FOR UPDATE guarantees a tile is consumed exactly once, and a
--      spammed/duplicate click gets a uniform 'tile_taken' error that never
--      leaks whether the tile held a reward.
-- ---------------------------------------------------------------------------
create or replace function public.play_tile(
  p_slug text,
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
   where merchant_id = v_merchant.id and status = 'active';
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

-- ---------------------------------------------------------------------------
-- redeem_code: merchant staff type a code (never look up by customer email).
-- Expiry is lazy: an expired code is flipped to 'expired' the moment someone
-- tries to redeem it. Once redeemed or expired, the code is invalid.
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
-- redeem_loyalty_points: fixed exchange, burn exactly 3 points for one 2%
-- discount code issued through the same redemption-code flow.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_loyalty_points(
  p_slug text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchant merchants%rowtype;
  v_customer_id uuid;
  v_state customer_merchant_state%rowtype;
  v_code text;
  v_expires_at timestamptz;
begin
  select * into v_merchant from merchants where slug = lower(trim(p_slug));
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'merchant_not_found');
  end if;

  select id into v_customer_id from customers where email = lower(trim(p_email));
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'insufficient_points');
  end if;

  select * into v_state from customer_merchant_state
   where customer_id = v_customer_id and merchant_id = v_merchant.id
   for update;
  if not found or v_state.loyalty_points < 3 then
    return jsonb_build_object('result', 'error', 'error', 'insufficient_points');
  end if;

  update customer_merchant_state
     set loyalty_points = loyalty_points - 3
   where customer_id = v_customer_id and merchant_id = v_merchant.id;

  v_code := generate_redemption_code();
  v_expires_at := now() + interval '168 hours';

  insert into unlocked_rewards
    (customer_id, merchant_id, reward_id, reward_type, discount_percent, redemption_code, expires_at)
  values
    (v_customer_id, v_merchant.id, null, 'loyalty_discount', 2, v_code, v_expires_at);

  return jsonb_build_object(
    'result', 'discount_issued',
    'discount_percent', 2,
    'code', v_code,
    'expires_at', v_expires_at,
    'loyalty_points', v_state.loyalty_points - 3
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- create_grid: archives the current active grid and builds a fresh one with
-- rewards placed on random tiles server-side. Each reward occupies
-- max_redemptions tiles (a tile is consumed once, so one tile = one claim).
-- Tier caps are enforced here as well as in the API route (defense in depth):
--   free    -> exactly 5x5, max 1 reward
--   premium -> 5x5 up to 20x20 (hard cap), max 10 rewards
-- p_rewards: jsonb array of {description, expiry_hours, max_redemptions}.
-- ---------------------------------------------------------------------------
create or replace function public.create_grid(
  p_merchant_id uuid,
  p_rows int,
  p_cols int,
  p_rewards jsonb
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
begin
  select * into v_merchant from merchants where id = p_merchant_id for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'merchant_not_found');
  end if;

  v_reward_count := coalesce(jsonb_array_length(p_rewards), 0);

  if v_merchant.subscription_tier = 'free' then
    if p_rows <> 5 or p_cols <> 5 then
      return jsonb_build_object('result', 'error', 'error', 'grid_size_not_allowed');
    end if;
    if v_reward_count > 1 then
      return jsonb_build_object('result', 'error', 'error', 'too_many_rewards');
    end if;
  else
    if p_rows < 5 or p_rows > 20 or p_cols < 5 or p_cols > 20 then
      return jsonb_build_object('result', 'error', 'error', 'grid_size_not_allowed');
    end if;
    if v_reward_count > 10 then
      return jsonb_build_object('result', 'error', 'error', 'too_many_rewards');
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

  update grids set status = 'archived'
   where merchant_id = p_merchant_id and status = 'active';

  insert into grids (merchant_id, rows, cols)
  values (p_merchant_id, p_rows, p_cols)
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

-- ---------------------------------------------------------------------------
-- These functions are for the service role only (API routes). Client sessions
-- must not be able to call them.
-- ---------------------------------------------------------------------------
revoke execute on function public.generate_redemption_code() from public, anon, authenticated;
revoke execute on function public.play_tile(text, int, int, text) from public, anon, authenticated;
revoke execute on function public.redeem_code(uuid, text) from public, anon, authenticated;
revoke execute on function public.redeem_loyalty_points(text, text) from public, anon, authenticated;
revoke execute on function public.create_grid(uuid, int, int, jsonb) from public, anon, authenticated;
