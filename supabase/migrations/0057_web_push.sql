-- ---------------------------------------------------------------------------
-- Web push
-- ---------------------------------------------------------------------------
--
-- The one channel that costs nothing to send on, for ever.
--
-- Email is already wired and already free at this volume, but it is rented:
-- it depends on a sending reputation that a single bad campaign burns, and on
-- this product that reputation also carries the six-digit codes people log in
-- with. Push has no such coupling. There is no per-message price, no domain to
-- ruin, and the browser owns the unsubscribe — which makes consent unambiguous
-- in a way an email list never is.
--
-- What it is *not* is a list you can build retroactively. A subscription can
-- only be created by a browser that asked, so this table starts empty and
-- fills from the moment the prompt ships. Nobody who has already lapsed is in
-- it until they come back once by some other means.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,

  /*
   * The push service's URL for this browser, and the two keys its payloads are
   * encrypted to. `endpoint` is unique and is the real identity here: a browser
   * that clears its data and re-subscribes gets a new one, and a device handed
   * to somebody else keeps the old one while the player behind it changes.
   * Conflicting on it rather than on the player is what keeps one row per
   * browser instead of one per (player, browser) pair.
   */
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,

  /** Only to tell a phone from a desktop in the admin list. Never parsed. */
  user_agent text,

  created_at timestamptz not null default now(),
  /** Refreshed whenever the browser re-registers, which it does on every visit. */
  renewed_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_failed_at timestamptz,
  /*
   * Consecutive soft failures. A 404 or 410 from the push service means the
   * subscription is gone for good and the row is deleted outright — this is
   * only for the timeouts and 5xxs, where deleting on the first one would
   * throw away a live subscriber because a push service had a bad minute.
   */
  failures int not null default 0 check (failures >= 0)
);

create index if not exists push_subscriptions_player_idx
  on public.push_subscriptions (player_id);

-- No policy is the security model, as everywhere else here. The browser talks
-- to a route handler; only the service role ever touches this table.
alter table public.push_subscriptions enable row level security;

-- ---------------------------------------------------------------------------
-- Who a message can go to
-- ---------------------------------------------------------------------------

/*
 * Every live subscription, with enough about its player to aim at.
 *
 * One view rather than a segment each, because a segment is a `where` clause
 * and there is no version of this where four near-identical views stay in
 * agreement. `days_idle` is computed against the same Lagos day the activity
 * board uses, so "idle for 7 days" means the same thing on both screens.
 */
create or replace view public.admin_push_targets as
select
  s.id,
  s.player_id,
  s.endpoint,
  s.p256dh,
  s.auth,
  s.failures,
  s.created_at,
  s.last_sent_at,
  s.user_agent,
  p.email,
  p.last_seen_at,
  public.activity_day() - public.activity_day(p.last_seen_at) as days_idle,
  coalesce(h.attempts, 0) as attempts,
  h.last_attempt_at as last_played_at
from public.push_subscriptions s
join public.players p on p.id = s.player_id
left join (
  select player_id,
         sum(attempts_count) as attempts,
         max(last_attempt_at) as last_attempt_at
    from public.hunts group by player_id
) h on h.player_id = p.id;

/** The same segments as counts, so the sender can say who it is about to wake. */
create or replace view public.admin_push_audience as
select
  count(*)                                              as total,
  count(distinct player_id)                             as players,
  count(*) filter (where days_idle >= 3 and days_idle < 30) as idle_short,
  count(*) filter (where days_idle >= 30)               as idle_long,
  count(*) filter (where attempts = 0)                  as never_played,
  count(*) filter (where failures > 0)                  as failing
from public.admin_push_targets;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.push_subscriptions from public, anon, authenticated;
revoke all on public.admin_push_targets from public, anon, authenticated;
revoke all on public.admin_push_audience from public, anon, authenticated;

grant select on public.admin_push_targets to service_role;
grant select on public.admin_push_audience to service_role;

-- ---------------------------------------------------------------------------
-- Tell PostgREST
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
