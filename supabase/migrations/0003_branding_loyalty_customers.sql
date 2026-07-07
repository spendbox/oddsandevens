-- Branding, merchant-configurable loyalty economy, and reward reshuffling.
--
--   * merchants gain logo_url / tagline / brand_color plus points_per_discount
--     and discount_percent (the loyalty exchange rate is now set per merchant).
--   * Free tier now allows 2 rewards on its 5x5 grid.
--   * After every successful tile-reward redemption, the still-hidden reward
--     tiles of the active grid are moved to new random positions.
--   * Public storage bucket for merchant logos (written via service role only).

-- ---------------------------------------------------------------------------
-- Merchant branding + loyalty settings
-- ---------------------------------------------------------------------------

alter table public.merchants
  add column logo_url text,
  add column tagline text check (char_length(tagline) <= 140),
  add column brand_color text not null default '#059669'
    check (brand_color ~ '^#[0-9a-f]{6}$'),
  add column points_per_discount int not null default 3
    check (points_per_discount between 1 and 100),
  add column discount_percent int not null default 2
    check (discount_percent between 1 and 100);

-- Logos live in a public-read bucket; uploads happen through the API route
-- with the service role, so no storage RLS policies are needed.
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- create_grid: free tier cap raised to 2 rewards (was 1).
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
    if v_reward_count > 2 then
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
-- redeem_code: unchanged flow, plus — after a tile reward is redeemed — the
-- remaining hidden reward tiles on the merchant's active grid are shuffled to
-- new random unrevealed positions, so winners can't tip off friends.
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

    -- Shuffle: pull the reward ids off every hidden reward tile of the active
    -- grid, then deal them back onto random hidden tiles one by one.
    select id into v_grid_id from grids
     where merchant_id = p_merchant_id and status = 'active';
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

-- ---------------------------------------------------------------------------
-- redeem_loyalty_points: exchange rate now comes from the merchant row
-- (points_per_discount -> discount_percent) instead of the baked-in 3 -> 2%.
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
  if not found or v_state.loyalty_points < v_merchant.points_per_discount then
    return jsonb_build_object('result', 'error', 'error', 'insufficient_points');
  end if;

  update customer_merchant_state
     set loyalty_points = loyalty_points - v_merchant.points_per_discount
   where customer_id = v_customer_id and merchant_id = v_merchant.id;

  v_code := generate_redemption_code();
  v_expires_at := now() + interval '168 hours';

  insert into unlocked_rewards
    (customer_id, merchant_id, reward_id, reward_type, discount_percent, redemption_code, expires_at)
  values
    (v_customer_id, v_merchant.id, null, 'loyalty_discount', v_merchant.discount_percent, v_code, v_expires_at);

  return jsonb_build_object(
    'result', 'discount_issued',
    'discount_percent', v_merchant.discount_percent,
    'code', v_code,
    'expires_at', v_expires_at,
    'loyalty_points', v_state.loyalty_points - v_merchant.points_per_discount
  );
end;
$$;
