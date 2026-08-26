-- ---------------------------------------------------------------------------
-- Player activity
-- ---------------------------------------------------------------------------
--
-- Until now the admin list could answer "what has this player spent" and
-- nothing about *when they were here*. `last_seen` was `max(hunts.last_attempt_at)`,
-- which is not when somebody was last seen — it is when they last spent a life.
-- A player who opens the app every evening, reads the board and closes it
-- looked identical to one who left in March.
--
-- Three things are recorded from here on:
--
--   **Seen.** Every page resolves its player through `ensure_player`, so that
--   is where a sighting belongs — it costs no extra round trip, and it is the
--   only place that fires for a visit that isn't a guess.
--
--   **Logged in.** A verification, which is the only thing here that is
--   actually a login. A player signs in once and is remembered for six months,
--   so this is rare by design and is worth counting separately from a visit.
--
--   **Played.** A guess, counted per day rather than only summed forever, so
--   the board can show what happened on a Tuesday.
--
-- `player_days` is the spine. One row per player per day, which makes daily
-- actives a range scan over an index rather than a distinct-count over every
-- attempt ever made.

-- ---------------------------------------------------------------------------
-- What a day is
-- ---------------------------------------------------------------------------

/*
 * The zone every activity figure is bucketed in.
 *
 * Not UTC. Spendbox is priced in naira, paid through a Nigerian processor and
 * read by people in Lagos, so a day that ends at 1am local is a day that puts
 * an evening's play on tomorrow's bar. WAT has no daylight saving, so this is
 * a fixed offset in practice and the buckets never shift under a chart.
 *
 * A function rather than a literal because it appears in a table default, two
 * views and a backfill, and those four have to agree forever.
 */
create or replace function public.activity_zone()
returns text language sql immutable parallel safe as $$ select 'Africa/Lagos' $$;

create or replace function public.activity_day(p_at timestamptz default now())
returns date language sql stable parallel safe as $$
  select (p_at at time zone public.activity_zone())::date
$$;

-- ---------------------------------------------------------------------------
-- Columns on the player
-- ---------------------------------------------------------------------------

alter table public.players
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists login_count int not null default 0
    check (login_count >= 0);

-- Recently-seen is the admin list's default sort, so it gets an index rather
-- than a sort over every player.
create index if not exists players_last_seen_idx
  on public.players (last_seen_at desc nulls last);

-- ---------------------------------------------------------------------------
-- A day of one player's activity
-- ---------------------------------------------------------------------------

create table if not exists public.player_days (
  player_id uuid not null references public.players (id) on delete cascade,
  day date not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Sessions, not page loads: see the gap rule in `touch_player`.
  visits int not null default 0 check (visits >= 0),
  logins int not null default 0 check (logins >= 0),
  attempts int not null default 0 check (attempts >= 0),
  primary key (player_id, day)
);

-- The daily board reads a date range across every player, which is the
-- opposite of the primary key's order.
create index if not exists player_days_day_idx on public.player_days (day desc);

-- No policy is the security model, as everywhere else here: the browser never
-- talks to this table, and only the service role can read or write it.
alter table public.player_days enable row level security;

-- ---------------------------------------------------------------------------
-- Recording it
-- ---------------------------------------------------------------------------

/*
 * Note that a player did something.
 *
 *   seen     they loaded a page. The hot path — every page resolves a player.
 *   login    they verified an address.
 *   attempt  they spent a life on a guess.
 *
 * **A sighting is throttled and a visit is not a page load.** Writing on every
 * request would put one UPDATE and one UPSERT behind every navigation for a
 * figure nobody reads to the minute, so a sighting inside `SEEN_GRAIN` of the
 * last one is dropped entirely, and `visits` only counts when the gap since
 * the last sighting is longer than `SESSION_GAP` — which makes it a count of
 * sittings rather than of clicks. The throttle is lifted at a day boundary so
 * the first visit after midnight always opens its own row.
 *
 * A login or an attempt is never throttled: both are rare enough to be worth
 * every write, and both are the answer to a support email.
 */
create or replace function public.touch_player(p_player_id uuid, p_kind text default 'seen')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  seen_grain  constant interval := interval '5 minutes';
  session_gap constant interval := interval '30 minutes';
  v_prev timestamptz;
  v_day date := public.activity_day();
  v_visit int;
begin
  if p_player_id is null then return; end if;

  select last_seen_at into v_prev from public.players where id = p_player_id;
  if not found then return; end if;

  if p_kind = 'seen'
     and v_prev is not null
     and v_prev > now() - seen_grain
     and public.activity_day(v_prev) = v_day
  then
    return;
  end if;

  v_visit := case
    when p_kind <> 'seen' then 0
    when v_prev is null or v_prev < now() - session_gap then 1
    else 0
  end;

  insert into public.player_days as d
    (player_id, day, first_seen_at, last_seen_at, visits, logins, attempts)
  values (
    p_player_id, v_day, now(), now(),
    v_visit,
    case when p_kind = 'login'   then 1 else 0 end,
    case when p_kind = 'attempt' then 1 else 0 end
  )
  on conflict (player_id, day) do update set
    last_seen_at = now(),
    visits   = d.visits   + v_visit,
    logins   = d.logins   + case when p_kind = 'login'   then 1 else 0 end,
    attempts = d.attempts + case when p_kind = 'attempt' then 1 else 0 end;

  update public.players set
    last_seen_at  = now(),
    last_login_at = case when p_kind = 'login' then now() else last_login_at end,
    login_count   = login_count + case when p_kind = 'login' then 1 else 0 end
  where id = p_player_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Where it is called from
-- ---------------------------------------------------------------------------

/*
 * `ensure_player` gains the sighting, and that placement is the whole design.
 *
 * Every surface with a life count on it resolves its player here — the lobby,
 * a box, the safehouse, the state poll — so this fires for a visit that never
 * becomes a guess, which is exactly the population the old `last_seen` could
 * not see. Doing it here also costs nothing: the round trip was already being
 * made, and the throttle above keeps it to one write per player per five
 * minutes however hard somebody refreshes.
 *
 * Otherwise unchanged from 0029.
 */
create or replace function public.ensure_player(p_email citext)
returns public.players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.players (email, invite_code)
    values (p_email, public.new_invite_code())
    on conflict (email) do nothing;
  select id into v_id from public.players where email = p_email;

  update public.players set invite_code = public.new_invite_code()
   where id = v_id and invite_code is null;

  perform public.touch_player(v_id, 'seen');

  return public.sync_lives(v_id);
end;
$$;

/*
 * `spend_attempt` gains the play, and nothing else.
 *
 * Copied forward from 0048 with one `perform` added after the attempt row is
 * written — after, so a guess refused for want of a life is not counted as a
 * play. It cannot go in a route: the route is not the thing that writes the
 * attempt, and a guess that arrives twice must not be counted twice.
 */
create or replace function public.spend_attempt(
  p_email citext,
  p_box_id uuid,
  p_guess text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
  v_box public.boxes;
  v_hunt public.hunts;
  v_score record;
  v_ordinal int;
  v_won boolean;
  v_claimed jsonb;
  v_free boolean;
  v_wind timestamptz;
begin
  v_player := public.ensure_player(p_email);

  select * into v_box from public.boxes where id = p_box_id;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'box_not_found');
  end if;
  if v_box.status = 'unlocked' then
    return jsonb_build_object('result', 'error', 'error', 'box_unlocked');
  end if;
  if v_box.status <> 'live' then
    return jsonb_build_object('result', 'error', 'error', 'box_not_live');
  end if;

  insert into public.hunts (box_id, player_id) values (p_box_id, v_player.id)
    on conflict (box_id, player_id) do nothing;
  select * into v_hunt from public.hunts
    where box_id = p_box_id and player_id = v_player.id for update;

  if v_hunt.won_at is not null then
    return jsonb_build_object('result', 'error', 'error', 'already_won');
  end if;

  v_wind := public.second_wind_until(v_hunt.revealed);
  v_free := v_wind is not null and v_wind > now();

  if not v_free then
    if v_player.lives < 1 then
      return jsonb_build_object(
        'result', 'error',
        'error', 'no_lives',
        'next_life_at', v_player.lives_accrued_at + public.life_regen()
      );
    end if;

    update public.players set lives = lives - 1
      where id = v_player.id returning * into v_player;
  end if;

  select * into v_score from public.score_attempt(v_box.secret, p_guess);
  v_won := (p_guess = v_box.secret);
  v_ordinal := v_hunt.attempts_count;

  insert into public.attempts (
    hunt_id, ordinal, value, length_hint,
    exact_count, miscase_count, elsewhere_count, elsewhere_miscase_count,
    score_percent
  )
  values (
    v_hunt.id, v_ordinal, p_guess, v_score.length_hint,
    v_score.exact_count, v_score.miscase_count, v_score.elsewhere_count,
    v_score.elsewhere_miscase_count, v_score.score_percent
  );

  perform public.touch_player(v_player.id, 'attempt');

  update public.hunts
     set attempts_count = v_ordinal + 1,
         last_attempt_at = now(),
         best_percent = greatest(best_percent, v_score.score_percent),
         won_at = case when v_won then now() else won_at end
   where id = v_hunt.id;

  update public.boxes
     set attempts_count = attempts_count + 1,
         players_count = players_count + case when v_ordinal = 0 then 1 else 0 end,
         best_percent = greatest(best_percent, v_score.score_percent)
   where id = p_box_id;

  if v_won then
    v_claimed := public.claim_box(v_hunt.id);
  end if;

  return jsonb_build_object(
    'result', 'scored',
    'length_hint', v_score.length_hint,
    'score_percent', v_score.score_percent,
    'lives_left', v_player.lives,
    'free', v_free,
    'second_wind_until', v_wind,
    'outcome', coalesce(v_claimed->>'result', 'open'),
    'reward_kobo', v_claimed->'reward_kobo'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

/*
 * Every attempt ever made becomes the day it was made on.
 *
 * Without this the chart starts empty and reads as a platform nobody has ever
 * played, which is the worst possible first impression of a new screen. The
 * attempts carry their own timestamps, so the history is exact rather than
 * estimated — the only things it cannot reconstruct are visits and logins,
 * which were never written down.
 */
insert into public.player_days (player_id, day, first_seen_at, last_seen_at, visits, logins, attempts)
select h.player_id,
       public.activity_day(a.created_at),
       min(a.created_at),
       max(a.created_at),
       0, 0, count(*)
  from public.attempts a
  join public.hunts h on h.id = a.hunt_id
 group by h.player_id, public.activity_day(a.created_at)
on conflict (player_id, day) do nothing;

-- Last seen falls back to the last guess, then to the join date. It is the
-- best that can be said about somebody who was here before anyone was counting.
update public.players p
   set last_seen_at = greatest(p.created_at, coalesce(x.last_attempt_at, p.created_at))
  from (select player_id, max(last_attempt_at) as last_attempt_at
          from public.hunts group by player_id) x
 where x.player_id = p.id and p.last_seen_at is null;

update public.players set last_seen_at = created_at where last_seen_at is null;

/*
 * `last_login_at` is deliberately left null for everybody who already exists.
 *
 * Their row was created by a verification, so `created_at` is *a* login — but
 * it is the first one, and every login since went unrecorded. Writing it here
 * would put a date in a column headed "last login" that is not the last login,
 * which is worse than an empty cell: an empty cell is read as "we don't know",
 * and a wrong date is read as fact. The screen prints "—" for these.
 */

-- ---------------------------------------------------------------------------
-- The admin views
-- ---------------------------------------------------------------------------

-- Dropped rather than replaced: `create or replace view` cannot reorder or
-- retype a column, and `last_seen` changes from a derived maximum to a real
-- column of its own.
drop view if exists public.admin_players;

/*
 * One row per player, with everything an administrator answering a support
 * email needs — now including when they were last here, when they last logged
 * in, when they last played, and how much of that was recent.
 *
 * Still a view rather than queries stitched together in a route: the sums are
 * over five tables and getting one join wrong silently under-reports money.
 */
create view public.admin_players as
select
  p.id,
  p.email,
  p.lives,
  p.created_at,
  p.password_set_at is not null as has_password,
  p.invited_by is not null as was_invited,
  p.bank_name,
  p.account_name,
  coalesce(l.lives_bought, 0) as lives_bought,
  coalesce(l.life_kobo, 0) as life_kobo,
  coalesce(u.power_ups_bought, 0) as power_ups_bought,
  coalesce(u.power_up_kobo, 0) as power_up_kobo,
  coalesce(l.life_kobo, 0) + coalesce(u.power_up_kobo, 0) as spent_kobo,
  coalesce(l.life_kobo_30d, 0) + coalesce(u.power_up_kobo_30d, 0) as spent_30d_kobo,
  coalesce(h.hunts, 0) as hunts,
  coalesce(h.attempts, 0) as attempts,
  coalesce(w.wins, 0) as wins,
  coalesce(w.won_kobo, 0) as won_kobo,

  -- When, rather than how much.
  p.last_seen_at as last_seen,
  p.last_login_at,
  p.login_count,
  h.last_attempt_at as last_played_at,
  h.first_attempt_at as first_played_at,
  coalesce(d.days_active, 0) as days_active,
  coalesce(d.days_active_30, 0) as days_active_30,
  coalesce(d.attempts_7d, 0) as attempts_7d,
  coalesce(d.attempts_30d, 0) as attempts_30d,
  coalesce(d.visits, 0) as visits
from public.players p
left join (
  select player_id,
         sum(quantity) as lives_bought,
         sum(price_kobo) as life_kobo,
         sum(price_kobo) filter (where paid_at > now() - interval '30 days') as life_kobo_30d
    from public.life_orders where status = 'paid' group by player_id
) l on l.player_id = p.id
left join (
  select player_id,
         count(*) as power_ups_bought,
         sum(price_kobo) as power_up_kobo,
         sum(price_kobo) filter (where paid_at > now() - interval '30 days') as power_up_kobo_30d
    from public.power_up_orders where status = 'paid' group by player_id
) u on u.player_id = p.id
left join (
  select player_id,
         count(*) as hunts,
         sum(attempts_count) as attempts,
         max(last_attempt_at) as last_attempt_at,
         min(started_at) as first_attempt_at
    from public.hunts group by player_id
) h on h.player_id = p.id
left join (
  select player_id,
         count(*) filter (where attempts > 0 or visits > 0) as days_active,
         count(*) filter (where (attempts > 0 or visits > 0)
                            and day > public.activity_day() - 30) as days_active_30,
         sum(attempts) filter (where day > public.activity_day() - 7) as attempts_7d,
         sum(attempts) filter (where day > public.activity_day() - 30) as attempts_30d,
         sum(visits) as visits
    from public.player_days group by player_id
) d on d.player_id = p.id
left join (
  select player_id,
         count(*) as wins,
         sum(amount_kobo) as won_kobo
    from public.reward_claims group by player_id
) w on w.player_id = p.id;

/*
 * One row per day, for the last 180.
 *
 * The window is bounded in the view rather than by the caller so the series is
 * never a full scan of every day the platform has existed, and so a chart can
 * ask for "the last 30" by slicing rather than by grouping again. Days with no
 * activity are *present and zero*, because a chart that omits its quiet days
 * draws a flat line through them and lies about the shape.
 */
create or replace view public.admin_activity_daily as
with span as (
  select public.activity_day() as today
),
days as (
  select d::date as day
    from span, generate_series(span.today - 179, span.today, interval '1 day') d
),
act as (
  select pd.day,
         count(*) as active_players,
         count(*) filter (where pd.attempts > 0) as playing_players,
         coalesce(sum(pd.attempts), 0)::bigint as attempts,
         coalesce(sum(pd.visits), 0)::bigint as visits,
         count(*) filter (where pd.logins > 0) as logged_in_players
    from public.player_days pd, span
   where pd.day >= span.today - 179
   group by pd.day
),
signups as (
  select public.activity_day(created_at) as day, count(*)::bigint as new_players
    from public.players group by 1
),
money as (
  select m.day, sum(m.kobo)::bigint as revenue_kobo, sum(m.orders)::bigint as orders
    from (
      select public.activity_day(paid_at) as day,
             sum(price_kobo) as kobo, count(*) as orders
        from public.life_orders
       where status = 'paid' and paid_at is not null group by 1
      union all
      select public.activity_day(paid_at),
             sum(price_kobo), count(*)
        from public.power_up_orders
       where status = 'paid' and paid_at is not null group by 1
    ) m
   group by m.day
)
select
  d.day,
  coalesce(a.active_players, 0)     as active_players,
  coalesce(a.playing_players, 0)    as playing_players,
  coalesce(a.attempts, 0)           as attempts,
  coalesce(a.visits, 0)             as visits,
  coalesce(a.logged_in_players, 0)  as logged_in_players,
  coalesce(s.new_players, 0)        as new_players,
  coalesce(m.revenue_kobo, 0)       as revenue_kobo,
  coalesce(m.orders, 0)             as orders
from days d
left join act a     on a.day = d.day
left join signups s on s.day = d.day
left join money m   on m.day = d.day
order by d.day;

/*
 * The headline figures, in one row.
 *
 * Actives are counted over `player_days` rather than over `players.last_seen_at`
 * so that "active in the last 7 days" means seven days of evidence rather than
 * one timestamp compared seven ways — the two disagree the moment somebody is
 * seen once and never again, and the rolling window is the one worth trusting.
 */
create or replace view public.admin_activity_summary as
with span as (select public.activity_day() as today)
select
  (select count(*) from public.player_days, span
    where day = span.today)                                          as dau,
  (select count(*) from public.player_days, span
    where day = span.today - 1)                                      as dau_yesterday,
  (select count(distinct player_id) from public.player_days, span
    where day > span.today - 7)                                      as wau,
  (select count(distinct player_id) from public.player_days, span
    where day > span.today - 30)                                     as mau,
  (select coalesce(sum(attempts), 0) from public.player_days, span
    where day = span.today)::bigint                                  as attempts_today,
  (select coalesce(sum(attempts), 0) from public.player_days, span
    where day > span.today - 7)::bigint                              as attempts_7d,
  (select count(*) from public.attempts)::bigint                     as attempts_total,
  (select count(*) from public.players)                              as players_total,
  (select count(*) from public.players, span
    where public.activity_day(created_at) = span.today)              as new_today,
  (select count(*) from public.players, span
    where public.activity_day(created_at) > span.today - 7)          as new_7d,
  (select count(*) from public.players
    where last_seen_at > now() - interval '15 minutes')              as online_now,
  (select count(*) from public.players
    where last_login_at is not null)                                 as ever_logged_in;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Every one of these exposes an address, a spend or the shape of the whole
-- player base. Nothing but the service role sees any of it, and `public` is
-- the pseudo-role anon and authenticated inherit from.
revoke all on public.admin_players from public, anon, authenticated;
revoke all on public.admin_activity_daily from public, anon, authenticated;
revoke all on public.admin_activity_summary from public, anon, authenticated;
revoke all on public.player_days from public, anon, authenticated;
revoke execute on function public.touch_player(uuid, text) from public, anon, authenticated;

grant select on public.admin_players to service_role;
grant select on public.admin_activity_daily to service_role;
grant select on public.admin_activity_summary to service_role;

-- ---------------------------------------------------------------------------
-- Tell PostgREST
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
