-- Default reward validity becomes 30 days (was 2). Existing rewards keep
-- their configured value; only the fallback changes.

alter table public.rewards alter column expiry_days set default 30;

-- create_grid: same body as 0006, with the expiry_days fallback at 30.
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
    v_expiry_days := least(greatest(coalesce((v_reward->>'expiry_days')::int, 30), 1), 60);
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
