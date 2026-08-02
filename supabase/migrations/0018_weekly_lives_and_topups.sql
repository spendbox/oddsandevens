-- ---------------------------------------------------------------------------
-- 0018_weekly_lives_and_topups: lives are a week's budget, and can be bought.
--
-- Three plays a day across a business turned out to be a lot of plays: twenty
-- one a week is enough for anyone to grind a leaderboard by volume rather than
-- by skill, and it made the prize feel cheap. Lives are now three *per week*,
-- refreshed when the week is — the same rhythm as the leaderboard itself.
--
-- And a player who wants more can buy them: ₦250 for ten extra lives, good for
-- the current week only. Paid lives are counted separately from the free three
-- and from the ones earned by sharing, so a refund or a failed payment can be
-- reasoned about without touching anything a player earned.
--
-- The pool stays per business: a business's games share one budget.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The allowance, restated per week.
-- ---------------------------------------------------------------------------

alter table public.merchants
  drop constraint if exists merchants_daily_lives_check,
  drop constraint if exists merchants_max_bonus_lives_check;

alter table public.merchants
  rename column daily_lives to weekly_lives;

alter table public.merchants
  add constraint merchants_weekly_lives_check
    check (weekly_lives between 1 and 100),
  add constraint merchants_max_bonus_lives_check
    check (max_bonus_lives between 0 and 100);

-- A day's allowance is not a week's: everyone starts the new rule at three.
update public.merchants set weekly_lives = 3 where weekly_lives < 3;

-- ---------------------------------------------------------------------------
-- The ledger, rekeyed from a day to a week.
--
-- Weeks start on Monday, in UTC, which is what `date_trunc('week', ...)`
-- gives and what the seasons already roll on.
-- ---------------------------------------------------------------------------

create or replace function public.week_start(p_when timestamptz default now())
returns date
language sql
immutable
as $$
  select (date_trunc('week', (p_when at time zone 'utc'))::date);
$$;

alter table public.merchant_lives rename column day to week;

-- Collapse the daily rows into weekly ones. Spending is summed; the bonus a
-- player earned by sharing is kept at its highest, not multiplied by seven.
create table if not exists public.merchant_lives_weekly (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  week date not null,
  used int not null default 0 check (used >= 0),
  -- Earned by sharing; capped by merchants.max_bonus_lives.
  bonus int not null default 0 check (bonus >= 0),
  -- Bought with money. Kept apart so it can be audited on its own.
  purchased int not null default 0 check (purchased >= 0),
  primary key (merchant_id, customer_id, week)
);

insert into public.merchant_lives_weekly (merchant_id, customer_id, week, used, bonus)
select merchant_id, customer_id, public.week_start(week::timestamptz),
       sum(used), max(bonus)
  from public.merchant_lives
 group by merchant_id, customer_id, public.week_start(week::timestamptz)
on conflict (merchant_id, customer_id, week) do nothing;

drop table if exists public.merchant_lives;
alter table public.merchant_lives_weekly rename to merchant_lives;

grant select on public.merchant_lives to authenticated;
alter table public.merchant_lives enable row level security;

drop policy if exists merchant_lives_owner_select on public.merchant_lives;
create policy merchant_lives_owner_select on public.merchant_lives
  for select to authenticated
  using (
    exists (
      select 1 from public.merchants m
       where m.id = merchant_lives.merchant_id and m.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- What a player bought, and whether it has been paid for.
-- ---------------------------------------------------------------------------

create table if not exists public.life_purchases (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  week date not null,
  reference text not null unique,
  amount_kobo int not null check (amount_kobo > 0),
  lives int not null check (lives > 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists life_purchases_player_idx
  on public.life_purchases (customer_id, merchant_id, week);

grant select on public.life_purchases to authenticated;
alter table public.life_purchases enable row level security;

drop policy if exists life_purchases_owner_select on public.life_purchases;
create policy life_purchases_owner_select on public.life_purchases
  for select to authenticated
  using (
    exists (
      select 1 from public.merchants m
       where m.id = life_purchases.merchant_id and m.owner_id = auth.uid()
    )
  );

-- The price and size of a top-up live in settings, so they can be changed
-- without a deploy.
insert into public.app_settings (key, value)
values ('life_topup_price_kobo', to_jsonb(25000)),
       ('life_topup_lives', to_jsonb(10))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- merchant_lives_left: the week's budget, minus what's been spent.
-- ---------------------------------------------------------------------------

create or replace function public.merchant_lives_left(
  p_merchant_id uuid,
  p_customer_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowance int;
  v_cap int;
  v_lives merchant_lives%rowtype;
begin
  select weekly_lives, max_bonus_lives into v_allowance, v_cap
    from merchants where id = p_merchant_id;
  if not found then return 0; end if;

  select * into v_lives from merchant_lives
   where merchant_id = p_merchant_id and customer_id = p_customer_id
     and week = week_start();

  if not found then
    return v_allowance;
  end if;

  return greatest(
    v_allowance + least(v_lives.bonus, v_cap) + v_lives.purchased - v_lives.used,
    0
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_referral_life: sharing still pays, and the credit lasts the week.
-- ---------------------------------------------------------------------------

create or replace function public.claim_referral_life(
  p_code text,
  p_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referral game_referrals%rowtype;
  v_game games%rowtype;
  v_cap int;
  v_week date := week_start();
  v_bonus int;
begin
  select * into v_referral from game_referrals
   where code = upper(trim(p_code)) for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'unknown_code');
  end if;

  -- Inviting yourself is not sharing.
  if v_referral.customer_id = p_customer_id then
    return jsonb_build_object('result', 'error', 'error', 'self_referral');
  end if;

  select * into v_game from games where id = v_referral.game_id;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'game_not_found');
  end if;

  select max_bonus_lives into v_cap from merchants where id = v_game.merchant_id;
  v_cap := coalesce(v_cap, 0);

  -- One life per invited person, ever. FOUND is false when the row was already
  -- there, which is exactly "this person has already been invited".
  insert into game_referral_claims (referral_id, customer_id)
  values (v_referral.id, p_customer_id)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('result', 'already_claimed');
  end if;

  insert into merchant_lives (merchant_id, customer_id, week, used, bonus)
  values (v_game.merchant_id, v_referral.customer_id, v_week, 0, least(1, v_cap))
  on conflict (merchant_id, customer_id, week) do update
    set bonus = least(merchant_lives.bonus + 1, v_cap)
  returning bonus into v_bonus;

  update game_referrals
     set invited_count = invited_count + 1
   where id = v_referral.id;

  return jsonb_build_object('result', 'granted', 'bonus_this_week', v_bonus);
end;
$$;

-- ---------------------------------------------------------------------------
-- credit_life_purchase: a payment cleared, so the lives land.
--
-- Idempotent on the reference: Paystack can be verified more than once (the
-- callback and the webhook both do it), and a player must not be charged once
-- and credited twice.
-- ---------------------------------------------------------------------------

create or replace function public.credit_life_purchase(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase life_purchases%rowtype;
begin
  select * into v_purchase from life_purchases
   where reference = p_reference for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'unknown_reference');
  end if;
  if v_purchase.status = 'paid' then
    return jsonb_build_object('result', 'already_credited', 'lives', v_purchase.lives);
  end if;

  insert into merchant_lives (merchant_id, customer_id, week, used, bonus, purchased)
  values (
    v_purchase.merchant_id, v_purchase.customer_id, v_purchase.week,
    0, 0, v_purchase.lives
  )
  on conflict (merchant_id, customer_id, week) do update
    set purchased = merchant_lives.purchased + v_purchase.lives;

  update life_purchases
     set status = 'paid', paid_at = now()
   where id = v_purchase.id;

  return jsonb_build_object('result', 'credited', 'lives', v_purchase.lives);
end;
$$;

-- ---------------------------------------------------------------------------
-- finish_game_play: spends a life from the week's pool.
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
  v_state customer_merchant_state%rowtype;
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
    -- Spend the life this play was opened against, from the week's pool.
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
         set total_plays = total_plays + 1,
             loyalty_code = coalesce(loyalty_code, generate_customer_code(v_merchant.id))
       where customer_id = v_play.customer_id and merchant_id = v_merchant.id
       returning * into v_state;
    end if;

    select * into v_season from game_seasons where id = v_play.season_id;

    -- Personal best and standing, within this season only.
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
      'season_ends_at', v_season.ends_at,
      'loyalty_points', coalesce(v_state.loyalty_points, 0),
      'points_expire_at', v_state.points_expire_at,
      'loyalty_code', v_state.loyalty_code
    );
  end if;

  -- ----- Instant-win games (unchanged) ----------------------------------
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

  if v_unlocked_id is null and v_play.customer_id is not null then
    update customer_merchant_state
       set loyalty_points = loyalty_points + 1,
           points_expire_at = now() + interval '7 days',
           total_plays = total_plays + 1,
           loyalty_code = coalesce(loyalty_code, generate_customer_code(v_merchant.id))
     where customer_id = v_play.customer_id and merchant_id = v_merchant.id
     returning * into v_state;
  elsif v_play.customer_id is not null then
    update customer_merchant_state
       set total_plays = total_plays + 1,
           loyalty_code = coalesce(loyalty_code, generate_customer_code(v_merchant.id))
     where customer_id = v_play.customer_id and merchant_id = v_merchant.id
     returning * into v_state;
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
    'loyalty_points', coalesce(v_state.loyalty_points, 0),
    'points_expire_at', v_state.points_expire_at,
    'loyalty_code', v_state.loyalty_code,
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
-- start_game_play: unchanged in shape; the refusal message now points at the
-- start of next week rather than tomorrow.
-- ---------------------------------------------------------------------------

create or replace function public.start_game_play(
  p_slug text,
  p_game_slug text,
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
  v_game games%rowtype;
  v_season game_seasons%rowtype;
  v_customer_id uuid;
  v_last_finished timestamptz;
  v_wins int;
  v_token uuid;
  v_base_allowance int;
  v_lives int;
begin
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('result', 'error', 'error', 'invalid_email');
  end if;

  select * into v_merchant from merchants where slug = lower(trim(p_slug));
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'merchant_not_found');
  end if;

  select * into v_game from games
   where merchant_id = v_merchant.id and slug = lower(trim(p_game_slug));
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'game_not_found');
  end if;
  if v_game.status <> 'active' then
    return jsonb_build_object('result', 'error', 'error', 'game_paused');
  end if;

  insert into customers (email)
  values (lower(trim(p_email)))
  on conflict (email) do update set email = excluded.email
  returning id into v_customer_id;

  insert into customer_merchant_state (customer_id, merchant_id)
  values (v_customer_id, v_merchant.id)
  on conflict (customer_id, merchant_id) do nothing;

  if v_game.award_mode = 'leaderboard' then
    -- Roll the week over if it's due, then make sure a board is open.
    perform close_due_game_season(v_game.id);
    v_season := ensure_game_season(v_game.id);

    v_lives := merchant_lives_left(v_merchant.id, v_customer_id);
    if v_lives <= 0 then
      return jsonb_build_object(
        'result', 'no_lives',
        'next_lives_at', (week_start() + 7)::timestamptz
      );
    end if;
  else
    -- Instant-win games: the per-game replay cooldown, as before.
    if v_game.cooldown_hours > 0 then
      select max(finished_at) into v_last_finished
        from game_plays
       where game_id = v_game.id and customer_id = v_customer_id
         and finished_at is not null;
      if v_last_finished is not null
         and v_last_finished > now() - make_interval(hours => v_game.cooldown_hours) then
        return jsonb_build_object(
          'result', 'cooldown',
          'next_play_at', v_last_finished + make_interval(hours => v_game.cooldown_hours)
        );
      end if;
    end if;
  end if;

  -- Allowance peek: the play is only charged when it is graded.
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
    return jsonb_build_object('result', 'no_plays');
  end if;

  select count(*) into v_wins
    from game_plays
   where game_id = v_game.id and customer_id = v_customer_id and won = true;

  insert into game_plays (game_id, merchant_id, customer_id, season_id)
  values (v_game.id, v_merchant.id, v_customer_id, v_season.id)
  returning token into v_token;

  return jsonb_build_object(
    'result', 'started',
    'token', v_token,
    'can_win', v_game.award_mode = 'leaderboard'
      or v_wins < v_game.max_wins_per_player,
    'lives_left', coalesce(v_lives, 0)
  );
end;
$$;

grant execute on function public.week_start(timestamptz) to anon, authenticated;
