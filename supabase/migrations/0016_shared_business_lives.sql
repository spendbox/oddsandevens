-- ---------------------------------------------------------------------------
-- 0016_shared_business_lives: lives belong to the business, not the game.
--
-- Until now a player got three lives a day on every game separately, so a
-- business with six games handed out eighteen plays a day and the leaderboards
-- stopped being about skill. Lives are now one pool per business per day: three
-- plays a day across everything that business runs, plus whatever the player
-- earns by sharing.
--
-- The allowance itself moves onto the merchant for the same reason — one
-- number, so it can't disagree with itself from game to game. Existing games'
-- settings seed it, and games.daily_lives / games.max_bonus_lives stay on the
-- table so nothing that reads them breaks.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The business-level allowance.
-- ---------------------------------------------------------------------------

alter table public.merchants
  add column if not exists daily_lives int not null default 3
    check (daily_lives between 1 and 20),
  add column if not exists max_bonus_lives int not null default 3
    check (max_bonus_lives between 0 and 20);

-- Seed from what the business had set on its games, so nobody's allowance
-- silently shrinks. The most generous game wins.
update public.merchants m
   set daily_lives = sub.daily_lives,
       max_bonus_lives = sub.max_bonus_lives
  from (
    select merchant_id,
           least(greatest(max(daily_lives), 1), 20) as daily_lives,
           least(max(max_bonus_lives), 20) as max_bonus_lives
      from public.games
     where status in ('active', 'paused', 'draft')
     group by merchant_id
  ) sub
 where sub.merchant_id = m.id;

-- ---------------------------------------------------------------------------
-- One pool of lives per player per business per day.
-- ---------------------------------------------------------------------------

create table if not exists public.merchant_lives (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  day date not null,
  used int not null default 0 check (used >= 0),
  -- Earned by sharing; capped by merchants.max_bonus_lives.
  bonus int not null default 0 check (bonus >= 0),
  primary key (merchant_id, customer_id, day)
);

-- Carry today's spending across: a player mid-way through their day keeps the
-- plays they have already used. Summing is the conservative direction — it can
-- only cost lives that were genuinely spent.
insert into public.merchant_lives (merchant_id, customer_id, day, used, bonus)
select g.merchant_id, l.customer_id, l.day, sum(l.used), max(l.bonus)
  from public.game_lives l
  join public.games g on g.id = l.game_id
 group by g.merchant_id, l.customer_id, l.day
on conflict (merchant_id, customer_id, day) do nothing;

drop table if exists public.game_lives;

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
-- merchant_lives_left: plays this player has in hand today, anywhere in this
-- business. This is now the only definition of a life.
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
  select daily_lives, max_bonus_lives into v_allowance, v_cap
    from merchants where id = p_merchant_id;
  if not found then return 0; end if;

  select * into v_lives from merchant_lives
   where merchant_id = p_merchant_id and customer_id = p_customer_id
     and day = (now() at time zone 'utc')::date;

  if not found then
    return v_allowance;
  end if;

  return greatest(v_allowance + least(v_lives.bonus, v_cap) - v_lives.used, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- game_lives_left: kept, because every read path already calls it — it just
-- asks the business now.
-- ---------------------------------------------------------------------------

create or replace function public.game_lives_left(
  p_game_id uuid,
  p_customer_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchant_id uuid;
begin
  select merchant_id into v_merchant_id from games where id = p_game_id;
  if not found then return 0; end if;
  return merchant_lives_left(v_merchant_id, p_customer_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_referral_life: a share still pays one life, and that life is now good
-- on any of the business's games.
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
  v_today date := (now() at time zone 'utc')::date;
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

  insert into merchant_lives (merchant_id, customer_id, day, used, bonus)
  values (v_game.merchant_id, v_referral.customer_id, v_today, 0, least(1, v_cap))
  on conflict (merchant_id, customer_id, day) do update
    set bonus = least(merchant_lives.bonus + 1, v_cap)
  returning bonus into v_bonus;

  update game_referrals
     set invited_count = invited_count + 1
   where id = v_referral.id;

  return jsonb_build_object('result', 'granted', 'bonus_today', v_bonus);
end;
$$;

-- ---------------------------------------------------------------------------
-- finish_game_play: unchanged except for where the life is spent — the pool is
-- the business's now. Recreated whole because plpgsql has no way to patch a
-- statement in place.
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
    -- Spend the life this play was opened against, from the business's pool.
    insert into merchant_lives (merchant_id, customer_id, day, used, bonus)
    values (v_merchant.id, v_play.customer_id, (now() at time zone 'utc')::date, 1, 0)
    on conflict (merchant_id, customer_id, day) do update
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

grant execute on function public.merchant_lives_left(uuid, uuid) to anon, authenticated;
