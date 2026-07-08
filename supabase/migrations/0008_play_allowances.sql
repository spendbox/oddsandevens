-- ---------------------------------------------------------------------------
-- 0008_play_allowances: plays-based billing.
--
--   * Every merchant gets an annual base allowance of plays by tier — free
--     (default 100/year) and premium (default 5,000/year), both tunable in
--     the admin console. The window rolls over 365 days after it started.
--   * On top of that, merchants can buy top-up plays (any quantity, priced per
--     1,000) that never expire. Available on both tiers, so a free merchant can
--     keep going without upgrading.
--   * A "play" is a tile tap that consumes a tile (hit or miss). play_tile
--     draws from the annual base first, then top-ups; when both are exhausted
--     it returns result 'no_plays' and pauses the board.
-- ---------------------------------------------------------------------------

alter table public.merchants
  add column if not exists plays_used int not null default 0,
  add column if not exists plays_period_start timestamptz not null default now(),
  add column if not exists topup_plays int not null default 0;

-- Admin-tunable allowances + top-up pricing (jsonb scalars, like the price).
insert into public.app_settings (key, value)
values
  ('free_yearly_plays', to_jsonb(100)),
  ('premium_yearly_plays', to_jsonb(5000)),
  ('topup_price_per_1000_kobo', to_jsonb(100000))
on conflict (key) do nothing;

-- Payments now cover premium renewals and one-off play top-ups.
alter table public.payments
  add column if not exists kind text not null default 'premium'
    check (kind in ('premium', 'topup')),
  add column if not exists plays_granted int not null default 0;

-- ---------------------------------------------------------------------------
-- play_tile: same as 0006 plus an annual/top-up play-allowance gate. The check
-- happens only once a tile is confirmed available (so cooldowns, taken tiles,
-- and invalid taps never burn a play), and the counter is decremented as the
-- tile is consumed.
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
  v_base_allowance int;
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

  -- Play allowance. Roll the annual window over lazily, then pick the base
  -- allowance for the merchant's effective tier (premium only while unexpired).
  if v_merchant.plays_period_start < now() - interval '365 days' then
    update merchants
       set plays_used = 0, plays_period_start = now()
     where id = v_merchant.id
     returning * into v_merchant;
  end if;

  if v_merchant.subscription_tier = 'premium'
     and v_merchant.premium_expires_at is not null
     and v_merchant.premium_expires_at > now() then
    select coalesce(
      (select (value #>> '{}')::int from app_settings where key = 'premium_yearly_plays'),
      5000
    ) into v_base_allowance;
  else
    select coalesce(
      (select (value #>> '{}')::int from app_settings where key = 'free_yearly_plays'),
      100
    ) into v_base_allowance;
  end if;

  -- Out of plays: pause before consuming the tile. Points/codes stay intact.
  if v_merchant.plays_used >= v_base_allowance and v_merchant.topup_plays <= 0 then
    return jsonb_build_object(
      'result', 'no_plays',
      'loyalty_points', v_state.loyalty_points,
      'points_expire_at', v_state.points_expire_at
    );
  end if;

  update tiles
     set is_revealed = true,
         revealed_by_customer_id = v_customer_id,
         revealed_at = now()
   where id = v_tile.id;

  -- Consume one play: draw from the annual base first, then top-ups.
  if v_merchant.plays_used < v_base_allowance then
    update merchants set plays_used = plays_used + 1 where id = v_merchant.id;
  else
    update merchants set topup_plays = greatest(topup_plays - 1, 0)
     where id = v_merchant.id;
  end if;

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
-- credit_topup_plays: atomically add purchased plays to a merchant's
-- non-expiring top-up balance (called by the payment-verify route).
-- ---------------------------------------------------------------------------

create or replace function public.credit_topup_plays(
  p_merchant_id uuid,
  p_plays int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_plays is null or p_plays <= 0 then
    return;
  end if;
  update merchants
     set topup_plays = topup_plays + p_plays
   where id = p_merchant_id;
end;
$$;
