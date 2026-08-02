-- ---------------------------------------------------------------------------
-- 0020_drop_loyalty_add_revenue: one currency, and a number for the money.
--
-- Loyalty points go. They were a second scoring system running alongside the
-- leaderboard, with their own expiry, their own exchange rate, their own code
-- at the counter and their own explanation — and a business had to set up both
-- before either made sense. Two currencies is one too many: what a player
-- chases is the top of the board, and what a business hands over is the prize
-- for being there.
--
-- What that removes:
--   * customer_merchant_state.loyalty_points / points_expire_at / loyalty_code
--   * merchants.points_per_discount / discount_percent
--   * redeem_loyalty_points(), and the 'loyalty_discount' reward type
--
-- What replaces it: nothing. The board is the loyalty scheme.
--
-- Also adds the money view. Players buy lives; the business whose game they
-- bought them for keeps 70% and the platform keeps 30%, so both the dashboard
-- and the admin page can answer "how much has this made" from one place rather
-- than from two different sums that will eventually disagree.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Anything that reads the columns has to go first.
-- ---------------------------------------------------------------------------

drop function if exists public.redeem_loyalty_points(text, text);
drop function if exists public.redeem_loyalty_points(text, uuid);
drop function if exists public.redeem_loyalty_by_code(uuid, text);

-- lookup_staff_code, with the points namespace removed. One kind of code
-- reaches the counter now: the one-time code minted when a prize was won.
-- Codes from the retired products still resolve, because a customer holding
-- one is owed what it says.
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
  v_email text;
  v_ur unlocked_rewards%rowtype;
  v_description text;
begin
  v_code := upper(trim(p_code));
  if v_code !~ '^[A-Z0-9]{6}$' then
    return jsonb_build_object('result', 'error', 'error', 'code_not_found');
  end if;

  if not exists (select 1 from merchants where id = p_merchant_id) then
    return jsonb_build_object('result', 'error', 'error', 'merchant_not_found');
  end if;

  select * into v_ur from unlocked_rewards
   where redemption_code = v_code and merchant_id = p_merchant_id;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'code_not_found');
  end if;

  if v_ur.reward_type = 'game' then
    select description into v_description from game_prizes where id = v_ur.game_prize_id;
    v_description := coalesce(v_description, 'Game prize');
  elsif v_ur.reward_type = 'tile' then
    select description into v_description from rewards where id = v_ur.reward_id;
    v_description := coalesce(v_description, 'Reward');
  else
    v_description := v_ur.discount_percent || '% discount';
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
end;
$$;

-- redeem_code has never known about game prizes: it branched on 'tile' and
-- treated everything else as a points discount, so redeeming a prize won in a
-- game returned a null description and the "collected" email said nothing.
-- Same three branches as the lookup, and the grid reshuffle goes with the
-- product it belonged to.
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

  if v_ur.reward_type = 'game' then
    select description into v_description from game_prizes where id = v_ur.game_prize_id;
    v_description := coalesce(v_description, 'Game prize');
  elsif v_ur.reward_type = 'tile' then
    select description into v_description from rewards where id = v_ur.reward_id;
    v_description := coalesce(v_description, 'Reward');
  else
    v_description := v_ur.discount_percent || '% discount';
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

revoke execute on function public.redeem_code(uuid, text) from public, anon, authenticated;

-- Codes already issued against the old scheme stay valid and redeemable; only
-- the ability to mint new ones goes. The check constraint is widened rather
-- than narrowed so nothing already in the table becomes illegal.
alter table public.unlocked_rewards
  drop constraint if exists unlocked_rewards_reward_type_check;
alter table public.unlocked_rewards
  add constraint unlocked_rewards_reward_type_check
    check (reward_type in ('tile', 'game', 'loyalty_discount'));

-- ---------------------------------------------------------------------------
-- The columns themselves.
-- ---------------------------------------------------------------------------

alter table public.customer_merchant_state
  drop column if exists loyalty_points,
  drop column if exists points_expire_at,
  drop column if exists loyalty_code;

alter table public.merchants
  drop column if exists points_per_discount,
  drop column if exists discount_percent;

-- ---------------------------------------------------------------------------
-- finish_game_play, without the points half.
--
-- Same shape as 0018 minus every loyalty write and every loyalty key in the
-- result. The instant-win branch no longer awards a consolation point for a
-- losing round: there is nothing to award it into.
-- ---------------------------------------------------------------------------

create or replace function public.finish_game_play(
  p_token uuid,
  p_score int default 0,
  p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_play game_plays%rowtype;
  v_game games%rowtype;
  v_merchant merchants%rowtype;
  v_prize game_prizes%rowtype;
  v_season game_seasons%rowtype;
  v_score int;
  v_wins int;
  v_can_win boolean;
  v_base_allowance int;
  v_total_weight int;
  v_roll int;
  v_acc int := 0;
  v_candidate game_prizes%rowtype;
  v_segment int;
  v_code text;
  v_expires_at timestamptz;
  v_unlocked_id uuid;
  v_best int;
  v_rank int;
  v_lives int;
begin
  select * into v_play from game_plays where token = p_token for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'play_not_found');
  end if;
  if v_play.finished_at is not null then
    return jsonb_build_object('result', 'error', 'error', 'play_already_finished');
  end if;
  if v_play.started_at < now() - interval '6 hours' then
    update game_plays set finished_at = now() where id = v_play.id;
    return jsonb_build_object('result', 'error', 'error', 'play_expired');
  end if;

  select * into v_game from games where id = v_play.game_id for update;
  select * into v_merchant from merchants where id = v_play.merchant_id for update;

  v_score := least(greatest(coalesce(p_score, 0), 0), v_game.max_score);

  -- Charge the play against the merchant's allowance.
  if v_merchant.plays_period_start < now() - interval '365 days' then
    update merchants set plays_used = 0, plays_period_start = now()
     where id = v_merchant.id returning * into v_merchant;
  end if;

  if v_merchant.subscription_tier = 'premium'
     and v_merchant.premium_expires_at is not null
     and v_merchant.premium_expires_at > now() then
    select coalesce(
      (select (value #>> '{}')::int from app_settings where key = 'premium_yearly_plays'), 5000
    ) into v_base_allowance;
  else
    select coalesce(
      (select (value #>> '{}')::int from app_settings where key = 'free_yearly_plays'), 100
    ) into v_base_allowance;
  end if;

  if v_merchant.plays_used >= v_base_allowance and v_merchant.topup_plays <= 0 then
    update game_plays
       set finished_at = now(), score = v_score, meta = coalesce(p_meta, '{}'::jsonb)
     where id = v_play.id;
    return jsonb_build_object('result', 'no_plays', 'score', v_score);
  end if;

  if v_merchant.plays_used < v_base_allowance then
    update merchants set plays_used = plays_used + 1 where id = v_merchant.id;
  else
    update merchants set topup_plays = greatest(topup_plays - 1, 0) where id = v_merchant.id;
  end if;

  -- ----- Leaderboard games ---------------------------------------------
  if v_game.award_mode = 'leaderboard' then
    insert into merchant_lives (merchant_id, customer_id, week, used, bonus)
    values (v_merchant.id, v_play.customer_id, week_start(), 1, 0)
    on conflict (merchant_id, customer_id, week) do update
      set used = merchant_lives.used + 1;

    update games set plays_count = plays_count + 1, updated_at = now()
     where id = v_game.id;

    update game_plays
       set finished_at = now(),
           score = v_score,
           meta = coalesce(p_meta, '{}'::jsonb),
           won = false
     where id = v_play.id;

    if v_play.customer_id is not null then
      update customer_merchant_state
         set total_plays = total_plays + 1
       where customer_id = v_play.customer_id and merchant_id = v_merchant.id;
    end if;

    select * into v_season from game_seasons where id = v_play.season_id;

    select coalesce(max(score), 0) into v_best
      from game_plays
     where game_id = v_game.id
       and customer_id = v_play.customer_id
       and season_id = v_play.season_id
       and finished_at is not null;

    select count(*) + 1 into v_rank
      from (
        select customer_id, max(score) as best
          from game_plays
         where season_id = v_play.season_id
           and finished_at is not null
           and customer_id is not null
         group by customer_id
      ) board
     where board.best > v_best;

    v_lives := merchant_lives_left(v_merchant.id, v_play.customer_id);

    return jsonb_build_object(
      'result', 'scored',
      'score', v_score,
      'best_score', v_best,
      'rank', v_rank,
      'lives_left', v_lives,
      'season_ends_at', v_season.ends_at
    );
  end if;

  -- ----- Instant-win games (retired, but still resolving) ----------------
  select count(*) into v_wins
    from game_plays
   where game_id = v_game.id and customer_id = v_play.customer_id
     and won = true and id <> v_play.id;
  v_can_win := v_wins < v_game.max_wins_per_player;

  if v_game.engine = 'chance' then
    select coalesce(sum(weight), 0) into v_total_weight
      from game_prizes
     where game_id = v_game.id
       and (kind = 'blank' or (v_can_win and claimed < stock));

    if v_total_weight > 0 then
      v_roll := floor(random() * v_total_weight)::int;
      for v_candidate in
        select * from game_prizes
         where game_id = v_game.id
           and (kind = 'blank' or (v_can_win and claimed < stock))
         order by position
      loop
        v_acc := v_acc + v_candidate.weight;
        if v_roll < v_acc then
          v_prize := v_candidate;
          exit;
        end if;
      end loop;
    end if;
  else
    select * into v_prize
      from game_prizes
     where game_id = v_game.id
       and kind = 'prize'
       and claimed < stock
       and min_score <= v_score
       and v_can_win
     order by min_score desc, position
     limit 1;
  end if;

  v_segment := null;
  if v_prize.id is not null then
    v_segment := v_prize.position;
  end if;

  if v_prize.id is not null and v_prize.kind = 'prize' then
    select * into v_prize from game_prizes where id = v_prize.id for update;
    if v_prize.claimed < v_prize.stock then
      v_code := generate_redemption_code();
      v_expires_at := now() + make_interval(days => v_prize.expiry_days);

      insert into unlocked_rewards
        (customer_id, merchant_id, reward_type, game_prize_id, redemption_code, expires_at)
      values
        (v_play.customer_id, v_merchant.id, 'game', v_prize.id, v_code, v_expires_at)
      returning id into v_unlocked_id;

      update game_prizes set claimed = claimed + 1 where id = v_prize.id;
      update games set wins_count = wins_count + 1 where id = v_game.id;
    else
      v_prize := null;
      v_segment := null;
    end if;
  end if;

  update games
     set plays_count = plays_count + 1, updated_at = now()
   where id = v_game.id;

  update game_plays
     set finished_at = now(),
         score = v_score,
         meta = coalesce(p_meta, '{}'::jsonb),
         won = v_unlocked_id is not null,
         prize_id = case when v_unlocked_id is not null then v_prize.id else null end,
         unlocked_reward_id = v_unlocked_id
   where id = v_play.id;

  if v_play.customer_id is not null then
    update customer_merchant_state
       set total_plays = total_plays + 1
     where customer_id = v_play.customer_id and merchant_id = v_merchant.id;
  end if;

  select coalesce(max(score), 0) into v_best
    from game_plays
   where game_id = v_game.id and customer_id = v_play.customer_id
     and finished_at is not null;

  select count(*) + 1 into v_rank
    from (
      select customer_id, max(score) as best
        from game_plays
       where game_id = v_game.id and finished_at is not null and customer_id is not null
       group by customer_id
    ) boards
   where boards.best > v_best;

  return jsonb_build_object(
    'result', case when v_unlocked_id is not null then 'win' else 'lose' end,
    'segment_index', v_segment,
    'prize', case
      when v_unlocked_id is not null then jsonb_build_object(
        'description', v_prize.description,
        'details', v_prize.details,
        'icon', v_prize.icon
      )
      else null
    end,
    'code', v_code,
    'expires_at', v_expires_at,
    'score', v_score,
    'best_score', v_best,
    'rank', v_rank,
    'can_win_again', v_wins + (case when v_unlocked_id is not null then 1 else 0 end)
      < v_game.max_wins_per_player,
    'next_play_at', case
      when v_game.cooldown_hours > 0 then now() + make_interval(hours => v_game.cooldown_hours)
      else null
    end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The money.
--
-- A player's ₦250 is split at the point it is counted rather than at the point
-- it is taken: one paid row, two shares of it. Keeping the rate in settings
-- means changing the deal doesn't rewrite history — old rows re-split at the
-- new rate, which is the honest behaviour for a headline figure and the reason
-- payouts are reconciled from `life_purchases` itself, not from this.
-- ---------------------------------------------------------------------------

insert into public.app_settings (key, value)
values ('platform_revenue_share_percent', to_jsonb(30))
on conflict (key) do nothing;

create or replace function public.platform_share_percent()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(least(coalesce(
    (select (value #>> '{}')::int from app_settings
      where key = 'platform_revenue_share_percent'), 30
  ), 100), 0);
$$;

/**
 * What one business has made from life sales, and what the platform took.
 * `p_merchant_id` null totals every business — the admin view.
 */
create or replace function public.life_revenue(p_merchant_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_share int := platform_share_percent();
  v_gross bigint;
  v_orders int;
  v_lives bigint;
  v_gross_30d bigint;
begin
  select coalesce(sum(amount_kobo), 0), count(*), coalesce(sum(lives), 0)
    into v_gross, v_orders, v_lives
    from life_purchases
   where status = 'paid'
     and (p_merchant_id is null or merchant_id = p_merchant_id);

  select coalesce(sum(amount_kobo), 0) into v_gross_30d
    from life_purchases
   where status = 'paid'
     and paid_at > now() - interval '30 days'
     and (p_merchant_id is null or merchant_id = p_merchant_id);

  return jsonb_build_object(
    'gross_kobo', v_gross,
    'platform_kobo', (v_gross * v_share) / 100,
    -- The business gets the remainder, so the two always sum to the gross
    -- however the percentage rounds.
    'business_kobo', v_gross - (v_gross * v_share) / 100,
    'gross_30d_kobo', v_gross_30d,
    'business_30d_kobo', v_gross_30d - (v_gross_30d * v_share) / 100,
    'orders', v_orders,
    'lives_sold', v_lives,
    'platform_share_percent', v_share
  );
end;
$$;

revoke execute on function public.life_revenue(uuid) from public, anon, authenticated;
grant execute on function public.platform_share_percent() to authenticated;
