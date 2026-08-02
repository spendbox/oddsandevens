-- ---------------------------------------------------------------------------
-- 0015_leaderboard_seasons: games become weekly competitions.
--
-- Instead of winning the moment you clear a target score, players compete on a
-- public leaderboard that runs for a week. When the week closes, the prizes go
-- to the top of the board by rank, the codes are emailed to the winners, and a
-- fresh week opens with an empty board.
--
-- Because the prize is the rank rather than the play, playing often is the
-- point: a player gets three lives a day per game, and can earn extra lives by
-- sharing their own link with someone who then plays.
--
-- The instant-win games (wheel, scratch card, ...) are no longer offered in the
-- builder, but everything already published keeps working: games carry an
-- award_mode, and 'instant' behaves exactly as it did before this migration.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Games: how they award, and how long a season runs.
-- ---------------------------------------------------------------------------

alter table public.games
  add column if not exists award_mode text not null default 'instant',
  add column if not exists season_days int not null default 7;

alter table public.games drop constraint if exists games_award_mode_check;
alter table public.games add constraint games_award_mode_check
  check (award_mode in ('instant', 'leaderboard'));

alter table public.games drop constraint if exists games_season_days_check;
alter table public.games add constraint games_season_days_check
  check (season_days between 1 and 90);

-- Lives per player per day, and how many extra a player may earn by sharing.
alter table public.games
  add column if not exists daily_lives int not null default 3,
  add column if not exists max_bonus_lives int not null default 3;

alter table public.games drop constraint if exists games_lives_check;
alter table public.games add constraint games_lives_check
  check (daily_lives between 1 and 20 and max_bonus_lives between 0 and 20);

-- Which place on the board this prize belongs to. 1 = first place.
alter table public.game_prizes
  add column if not exists award_rank int;

alter table public.game_prizes drop constraint if exists game_prizes_award_rank_check;
alter table public.game_prizes add constraint game_prizes_award_rank_check
  check (award_rank is null or award_rank between 1 and 100);

-- ---------------------------------------------------------------------------
-- Seasons — one week of a leaderboard.
-- ---------------------------------------------------------------------------

create table if not exists public.game_seasons (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  -- 1, 2, 3… so the UI can say "week 4".
  number int not null default 1,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists game_seasons_game_idx on public.game_seasons (game_id, starts_at desc);
create unique index if not exists game_seasons_one_open_idx
  on public.game_seasons (game_id) where status = 'open';

-- Who won what, when a season closed. Also the queue the mailer works from.
create table if not exists public.game_season_winners (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.game_seasons (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  rank int not null,
  score int not null,
  prize_id uuid references public.game_prizes (id) on delete set null,
  unlocked_reward_id uuid references public.unlocked_rewards (id) on delete set null,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists game_season_winners_season_idx
  on public.game_season_winners (season_id, rank);
create index if not exists game_season_winners_pending_idx
  on public.game_season_winners (game_id) where notified_at is null;

-- Which season a play belongs to, so a closed board can never move.
alter table public.game_plays
  add column if not exists season_id uuid references public.game_seasons (id) on delete set null;

create index if not exists game_plays_season_idx
  on public.game_plays (season_id, score desc) where finished_at is not null;

-- ---------------------------------------------------------------------------
-- Lives — the play budget, per player per game per day.
-- ---------------------------------------------------------------------------

create table if not exists public.game_lives (
  game_id uuid not null references public.games (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  day date not null,
  used int not null default 0 check (used >= 0),
  -- Earned by sharing; capped by games.max_bonus_lives.
  bonus int not null default 0 check (bonus >= 0),
  primary key (game_id, customer_id, day)
);

-- Each player's share link per game. The code is what goes in the URL.
create table if not exists public.game_referrals (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  code text not null unique,
  invited_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, customer_id)
);

-- One life per person invited, ever — re-inviting the same player pays once.
create table if not exists public.game_referral_claims (
  referral_id uuid not null references public.game_referrals (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (referral_id, customer_id)
);

-- ---------------------------------------------------------------------------
-- Privileges + RLS.
-- ---------------------------------------------------------------------------

revoke all on
  public.game_seasons, public.game_season_winners, public.game_lives,
  public.game_referrals, public.game_referral_claims
  from anon, authenticated;

grant select on public.game_seasons, public.game_season_winners to authenticated;

alter table public.game_seasons enable row level security;
alter table public.game_season_winners enable row level security;
alter table public.game_lives enable row level security;
alter table public.game_referrals enable row level security;
alter table public.game_referral_claims enable row level security;

drop policy if exists game_seasons_owner_select on public.game_seasons;
create policy game_seasons_owner_select on public.game_seasons
  for select to authenticated
  using (game_id in (
    select g.id from public.games g
    join public.merchants m on m.id = g.merchant_id
    where m.owner_id = (select auth.uid())
  ));

drop policy if exists game_season_winners_owner_select on public.game_season_winners;
create policy game_season_winners_owner_select on public.game_season_winners
  for select to authenticated
  using (game_id in (
    select g.id from public.games g
    join public.merchants m on m.id = g.merchant_id
    where m.owner_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- ensure_game_season: the open season for a game, opening the first one on
-- demand. Every read path calls this, so a game always has a live board.
-- ---------------------------------------------------------------------------

create or replace function public.ensure_game_season(p_game_id uuid)
returns game_seasons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
  v_season game_seasons%rowtype;
begin
  select * into v_game from games where id = p_game_id;
  if not found then
    return null;
  end if;

  select * into v_season from game_seasons
   where game_id = p_game_id and status = 'open'
   limit 1;
  if found then
    return v_season;
  end if;

  insert into game_seasons (game_id, number, starts_at, ends_at)
  values (
    p_game_id,
    coalesce((select max(number) from game_seasons where game_id = p_game_id), 0) + 1,
    now(),
    now() + make_interval(days => v_game.season_days)
  )
  on conflict do nothing
  returning * into v_season;

  if v_season.id is null then
    select * into v_season from game_seasons
     where game_id = p_game_id and status = 'open' limit 1;
  end if;

  return v_season;
end;
$$;

-- ---------------------------------------------------------------------------
-- close_due_game_season: if the open season's week is up, rank the board, hand
-- the prizes to the top places, mint their codes, and open the next week.
--
-- Idempotent and safe to call from any read path: it does nothing until the
-- clock passes ends_at, and the unique index guarantees one open season.
-- ---------------------------------------------------------------------------

create or replace function public.close_due_game_season(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
  v_season game_seasons%rowtype;
  v_prize game_prizes%rowtype;
  v_row record;
  v_code text;
  v_expires_at timestamptz;
  v_unlocked_id uuid;
  v_awarded int := 0;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'game_not_found');
  end if;

  select * into v_season from game_seasons
   where game_id = p_game_id and status = 'open'
   for update;
  if not found or v_season.ends_at > now() then
    return jsonb_build_object('result', 'not_due');
  end if;

  -- Rank the board: a player's best score in the season, ties broken by who
  -- got there first.
  for v_row in
    select customer_id, best, first_at,
           row_number() over (order by best desc, first_at asc) as rank
      from (
        select customer_id,
               max(score) as best,
               min(finished_at) as first_at
          from game_plays
         where season_id = v_season.id
           and finished_at is not null
           and customer_id is not null
           and score > 0
         group by customer_id
      ) board
  loop
    -- Is there a prize for this place?
    select * into v_prize from game_prizes
     where game_id = p_game_id
       and kind = 'prize'
       and coalesce(award_rank, 1) = v_row.rank
       and claimed < stock
     order by position
     limit 1
     for update;

    if not found then
      -- No prize at this rank: still record the placing for the board's history.
      insert into game_season_winners (season_id, game_id, customer_id, rank, score)
      values (v_season.id, p_game_id, v_row.customer_id, v_row.rank, v_row.best);
      continue;
    end if;

    v_code := generate_redemption_code();
    v_expires_at := now() + make_interval(days => v_prize.expiry_days);

    insert into unlocked_rewards
      (customer_id, merchant_id, reward_type, game_prize_id, redemption_code, expires_at)
    values
      (v_row.customer_id, v_game.merchant_id, 'game', v_prize.id, v_code, v_expires_at)
    returning id into v_unlocked_id;

    update game_prizes set claimed = claimed + 1 where id = v_prize.id;
    update games set wins_count = wins_count + 1 where id = p_game_id;

    insert into game_season_winners
      (season_id, game_id, customer_id, rank, score, prize_id, unlocked_reward_id)
    values
      (v_season.id, p_game_id, v_row.customer_id, v_row.rank, v_row.best,
       v_prize.id, v_unlocked_id);

    v_awarded := v_awarded + 1;
  end loop;

  update game_seasons
     set status = 'closed', closed_at = now()
   where id = v_season.id;

  -- Straight into the next week, starting from where the last one ended so the
  -- weeks don't drift.
  insert into game_seasons (game_id, number, starts_at, ends_at)
  values (
    p_game_id,
    v_season.number + 1,
    v_season.ends_at,
    greatest(v_season.ends_at + make_interval(days => v_game.season_days), now())
  )
  on conflict do nothing;

  return jsonb_build_object(
    'result', 'closed',
    'season_id', v_season.id,
    'awarded', v_awarded
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- game_lives_left: how many plays a customer has in hand today.
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
  v_game games%rowtype;
  v_lives game_lives%rowtype;
begin
  select * into v_game from games where id = p_game_id;
  if not found then return 0; end if;

  select * into v_lives from game_lives
   where game_id = p_game_id and customer_id = p_customer_id
     and day = (now() at time zone 'utc')::date;

  if not found then
    return v_game.daily_lives;
  end if;

  return greatest(v_game.daily_lives + v_lives.bonus - v_lives.used, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_referral_life: someone played through a player's share link. The
-- inviter gets a life today, once per person invited, capped per game.
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

  -- One life per invited person, ever. FOUND is false when the row was already
  -- there, which is exactly "this person has already been invited".
  insert into game_referral_claims (referral_id, customer_id)
  values (v_referral.id, p_customer_id)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('result', 'already_claimed');
  end if;

  insert into game_lives (game_id, customer_id, day, used, bonus)
  values (
    v_referral.game_id, v_referral.customer_id, v_today, 0,
    least(1, v_game.max_bonus_lives)
  )
  on conflict (game_id, customer_id, day) do update
    set bonus = least(game_lives.bonus + 1, v_game.max_bonus_lives)
  returning bonus into v_bonus;

  update game_referrals
     set invited_count = invited_count + 1
   where id = v_referral.id;

  return jsonb_build_object('result', 'granted', 'bonus_today', v_bonus);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_or_create_referral: the player's own share code for a game.
-- ---------------------------------------------------------------------------

create or replace function public.get_or_create_referral(
  p_game_id uuid,
  p_customer_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempt int := 0;
begin
  select code into v_code from game_referrals
   where game_id = p_game_id and customer_id = p_customer_id;
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into game_referrals (game_id, customer_id, code)
      values (p_game_id, p_customer_id, v_code);
      return v_code;
    exception when unique_violation then
      -- Either the code clashed or another request just created this player's
      -- referral; check for the latter before trying again.
      select code into v_code from game_referrals
       where game_id = p_game_id and customer_id = p_customer_id;
      if v_code is not null then
        return v_code;
      end if;
      if v_attempt >= 5 then
        return null;
      end if;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- start_game_play: leaderboard games spend a life instead of waiting out a
-- cooldown. Instant-win games keep the cooldown they always had.
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

    v_lives := game_lives_left(v_game.id, v_customer_id);
    if v_lives <= 0 then
      return jsonb_build_object(
        'result', 'no_lives',
        'next_lives_at', ((now() at time zone 'utc')::date + 1)::timestamptz
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

-- ---------------------------------------------------------------------------
-- finish_game_play: on a leaderboard game the score goes on the board and a
-- life is spent — no prize is decided here, because the prize belongs to the
-- rank at the end of the week. Instant-win games behave exactly as before.
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
    -- Spend the life this play was opened against.
    insert into game_lives (game_id, customer_id, day, used, bonus)
    values (v_game.id, v_play.customer_id, (now() at time zone 'utc')::date, 1, 0)
    on conflict (game_id, customer_id, day) do update
      set used = game_lives.used + 1;

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

    v_lives := game_lives_left(v_game.id, v_play.customer_id);

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
-- create_game: accepts the award mode, the season length, the lives, and
-- rank-based prizes.
-- ---------------------------------------------------------------------------

drop function if exists public.create_game(
  uuid, text, text, text, text, text, jsonb, jsonb, jsonb, int, int, int, text, text
);

create function public.create_game(
  p_merchant_id uuid,
  p_type text,
  p_engine text,
  p_title text,
  p_slug text,
  p_description text,
  p_config jsonb,
  p_theme jsonb,
  p_prizes jsonb,
  p_cooldown_hours int default 24,
  p_max_wins int default 1,
  p_max_score int default 100000,
  p_status text default 'active',
  p_source text default 'manual',
  p_award_mode text default 'leaderboard',
  p_season_days int default 7,
  p_daily_lives int default 3,
  p_max_bonus_lives int default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchant merchants%rowtype;
  v_is_premium boolean;
  v_live_games int;
  v_prize_count int;
  v_real_prizes int;
  v_game_id uuid;
  v_slug text;
  v_status text;
  v_source text;
  v_award_mode text;
  v_prize jsonb;
  v_pos int := 0;
begin
  select * into v_merchant from merchants where id = p_merchant_id for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'merchant_not_found');
  end if;

  if p_title is null or char_length(trim(p_title)) = 0 then
    return jsonb_build_object('result', 'error', 'error', 'title_required');
  end if;

  v_status := case when p_status in ('draft', 'active', 'paused') then p_status else 'active' end;
  v_source := case when p_source = 'suggested' then 'suggested' else 'manual' end;
  v_award_mode := case when p_award_mode = 'instant' then 'instant' else 'leaderboard' end;

  v_slug := lower(trim(coalesce(p_slug, '')));
  if v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' then
    return jsonb_build_object('result', 'error', 'error', 'invalid_slug');
  end if;
  if exists (select 1 from games where merchant_id = p_merchant_id and slug = v_slug) then
    return jsonb_build_object('result', 'error', 'error', 'slug_taken');
  end if;

  v_is_premium := v_merchant.subscription_tier = 'premium'
    and v_merchant.premium_expires_at is not null
    and v_merchant.premium_expires_at > now();

  select count(*) into v_live_games
    from games
   where merchant_id = p_merchant_id and status = 'active';

  v_prize_count := coalesce(jsonb_array_length(p_prizes), 0);
  select count(*) into v_real_prizes
    from jsonb_array_elements(coalesce(p_prizes, '[]'::jsonb)) p
   where coalesce(p->>'kind', 'prize') = 'prize';

  if not v_is_premium then
    if v_status <> 'draft' and v_live_games >= 2 then
      return jsonb_build_object('result', 'error', 'error', 'too_many_games');
    end if;
    if v_real_prizes > 2 then
      return jsonb_build_object('result', 'error', 'error', 'too_many_prizes');
    end if;
  else
    if v_real_prizes > 10 then
      return jsonb_build_object('result', 'error', 'error', 'too_many_prizes');
    end if;
  end if;

  if v_prize_count > 24 then
    return jsonb_build_object('result', 'error', 'error', 'too_many_prizes');
  end if;

  -- A leaderboard game needs somewhere for the prizes to land; a chance game
  -- needs something to land on.
  if v_real_prizes < 1 and (v_award_mode = 'leaderboard' or p_engine = 'chance') then
    return jsonb_build_object('result', 'error', 'error', 'no_prizes');
  end if;

  insert into games (
    merchant_id, slug, type, engine, title, description, config, theme,
    cooldown_hours, max_wins_per_player, max_score, status, source,
    award_mode, season_days, daily_lives, max_bonus_lives
  )
  values (
    p_merchant_id,
    v_slug,
    p_type,
    p_engine,
    left(trim(p_title), 80),
    left(nullif(trim(coalesce(p_description, '')), ''), 300),
    coalesce(p_config, '{}'::jsonb),
    coalesce(p_theme, '{}'::jsonb),
    least(greatest(coalesce(p_cooldown_hours, 24), 0), 720),
    least(greatest(coalesce(p_max_wins, 1), 1), 100),
    least(greatest(coalesce(p_max_score, 100000), 1), 100000000),
    v_status,
    v_source,
    v_award_mode,
    least(greatest(coalesce(p_season_days, 7), 1), 90),
    least(greatest(coalesce(p_daily_lives, 3), 1), 20),
    least(greatest(coalesce(p_max_bonus_lives, 3), 0), 20)
  )
  returning id into v_game_id;

  for v_prize in select * from jsonb_array_elements(coalesce(p_prizes, '[]'::jsonb))
  loop
    insert into game_prizes (
      game_id, kind, description, details, icon, expiry_days, stock, weight,
      min_score, award_rank, position
    )
    values (
      v_game_id,
      case when coalesce(v_prize->>'kind', 'prize') = 'blank' then 'blank' else 'prize' end,
      left(coalesce(nullif(trim(coalesce(v_prize->>'description', '')), ''), 'Prize'), 200),
      left(nullif(trim(coalesce(v_prize->>'details', '')), ''), 300),
      left(nullif(trim(coalesce(v_prize->>'icon', '')), ''), 40),
      least(greatest(coalesce((v_prize->>'expiry_days')::int, 30), 1), 60),
      case
        when coalesce(v_prize->>'kind', 'prize') = 'blank' then 0
        else least(greatest(coalesce((v_prize->>'stock')::int, 1), 1), 100000)
      end,
      least(greatest(coalesce((v_prize->>'weight')::int, 1), 0), 10000),
      greatest(coalesce((v_prize->>'min_score')::int, 0), 0),
      case
        when v_award_mode = 'leaderboard'
          then least(greatest(coalesce((v_prize->>'award_rank')::int, v_pos + 1), 1), 100)
        else null
      end,
      v_pos
    );
    v_pos := v_pos + 1;
  end loop;

  -- Open the first week straight away so the board exists from the off.
  if v_award_mode = 'leaderboard' then
    perform ensure_game_season(v_game_id);
  end if;

  return jsonb_build_object(
    'result', 'created',
    'game_id', v_game_id,
    'slug', v_slug,
    'status', v_status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Service role only.
-- ---------------------------------------------------------------------------

revoke execute on function public.create_game(
  uuid, text, text, text, text, text, jsonb, jsonb, jsonb, int, int, int, text, text,
  text, int, int, int
) from public, anon, authenticated;
revoke execute on function public.ensure_game_season(uuid) from public, anon, authenticated;
revoke execute on function public.close_due_game_season(uuid) from public, anon, authenticated;
revoke execute on function public.game_lives_left(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.claim_referral_life(text, uuid) from public, anon, authenticated;
revoke execute on function public.get_or_create_referral(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.start_game_play(text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.finish_game_play(uuid, int, jsonb)
  from public, anon, authenticated;
