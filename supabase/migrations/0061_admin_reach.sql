-- ---------------------------------------------------------------------------
-- Seeing every hunt, and reaching every player
-- ---------------------------------------------------------------------------
--
-- Three things an administrator could not do:
--
--   * See who is closest on *any* box. A contributor sees their own boxes and
--     a player sees their own hunts; nobody could see the whole board, which
--     is the one view that answers "is anything about to be won".
--   * Tell somebody their lives are full. The pool refills on a clock whether
--     or not anyone is watching, and a full pool is the moment a lapsed player
--     has the most to come back to and the least reason to know it.
--   * Write to players at all.
--
-- The third one carries the thing the other two do not: an email nobody asked
-- for needs a way out of it, and this product had none.

-- ---------------------------------------------------------------------------
-- Every hunt on the board
-- ---------------------------------------------------------------------------

/*
 * One row per hunt, best first, across every box.
 *
 * A hunt rather than an attempt, and that is the useful grain: `attempts` has
 * a row per guess and a popular box has thousands, while what anybody actually
 * asks is "how close is the closest person" — which is `hunts.best_percent`,
 * already maintained by `spend_attempt` and already indexed.
 *
 * The address is *not* masked. This is the same decision the players list
 * makes and for the same reason: it is behind the admin session, and the
 * question it answers is a support question.
 */
create or replace view public.admin_best_attempts as
select
  h.id                       as hunt_id,
  h.box_id,
  b.slug                     as box_slug,
  b.title                    as box_title,
  b.kind                     as box_kind,
  b.status                   as box_status,
  b.reward_kobo,
  b.length                   as password_length,
  b.best_percent             as box_best_percent,
  h.player_id,
  p.email                    as player_email,
  h.best_percent,
  h.attempts_count,
  h.started_at,
  h.last_attempt_at,
  h.won_at,
  -- What they have paid to learn about this password, so a very high score
  -- can be read against how much of it was bought.
  coalesce(u.power_ups, 0)   as power_ups_bought,
  coalesce(u.power_up_kobo, 0) as power_up_kobo
from public.hunts h
join public.boxes b on b.id = h.box_id
join public.players p on p.id = h.player_id
left join (
  select hunt_id, count(*) as power_ups, sum(price_kobo) as power_up_kobo
    from public.power_up_orders where status = 'paid' group by hunt_id
) u on u.hunt_id = h.id;

-- ---------------------------------------------------------------------------
-- Telling somebody their lives are full
-- ---------------------------------------------------------------------------

/*
 * When we last said so, and whether they want to hear from us at all.
 *
 * `lives_full_notified_at` is what stops a daily job becoming an hourly one if
 * it is ever run more often than daily — the window is checked in SQL rather
 * than trusted from a scheduler, because a scheduler that fires twice is a
 * normal thing for a scheduler to do.
 */
alter table public.players
  add column if not exists lives_full_notified_at timestamptz,
  -- Email only. Push has its own unsubscribe and it is the browser's.
  add column if not exists unsubscribed_at timestamptz,
  /*
   * The token in an unsubscribe link.
   *
   * Random per player rather than a signature over the address, so that a leaked
   * link unsubscribes exactly one person and reveals nothing, and so that the
   * link keeps working if the signing secret is ever rotated.
   */
  add column if not exists unsubscribe_token text;

create index if not exists players_unsubscribe_token_idx
  on public.players (unsubscribe_token) where unsubscribe_token is not null;

/** Minted on demand and never regenerated, so old links keep working. */
create or replace function public.unsubscribe_token(p_player_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  select unsubscribe_token into v_token from public.players where id = p_player_id;
  if v_token is not null then return v_token; end if;

  v_token := public.random_hex(32);
  update public.players set unsubscribe_token = v_token
   where id = p_player_id and unsubscribe_token is null;

  select unsubscribe_token into v_token from public.players where id = p_player_id;
  return v_token;
end;
$$;

/** One click, no login, no confirmation step. That is what makes it honest. */
create or replace function public.unsubscribe_by_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_token is null or length(p_token) < 16 then return false; end if;
  update public.players set unsubscribed_at = coalesce(unsubscribed_at, now())
   where unsubscribe_token = p_token
   returning id into v_id;
  return v_id is not null;
end;
$$;

/*
 * Who should be told their lives are full.
 *
 * Four conditions, and the last two are the difference between a useful
 * notification and a nuisance:
 *
 *   * the pool is actually full — measured with `life_cap`, so a Life Bank
 *     ceiling is respected and nothing assumes seven;
 *   * they have a browser subscribed to push at all;
 *   * we have not told them inside the window, so a scheduler firing twice
 *     does not buzz anybody twice;
 *   * **they are not already here.** Somebody who played today knows what
 *     their life count is. This is for the person who has drifted, which is
 *     the only person for whom a full pool is news.
 */
create or replace function public.players_due_lives_push(
  p_window interval default interval '20 hours',
  p_idle_days int default 2,
  p_limit int default 500
)
returns table (player_id uuid, email citext, lives int, lives_max int)
language sql
stable
security definer
set search_path = public
as $$
  /*
   * `life_cap(p)` rather than `p.lives_max`, and that is not a detail.
   *
   * `lives_max` is nullable and null is the normal state — it means "the
   * platform default", and only a Life Bank purchase ever writes a number into
   * it. Comparing against the raw column made `lives >= lives_max` null for
   * almost everybody, which is not true, and a job whose only condition is
   * never true is a job that silently does nothing forever.
   *
   * `life_cap` is the function `sync_lives` and `grant_life_bank` already use,
   * so "full" means here exactly what it means everywhere else.
   */
  select p.id, p.email, p.lives, public.life_cap(p)
    from public.players p
   where p.lives >= public.life_cap(p)
     and exists (select 1 from public.push_subscriptions s where s.player_id = p.id)
     and (p.lives_full_notified_at is null or p.lives_full_notified_at < now() - p_window)
     and (p.last_seen_at is null or p.last_seen_at < now() - make_interval(days => p_idle_days))
   order by p.last_seen_at desc nulls last
   limit p_limit;
$$;

/** Stamped only for the ones a push actually went to. */
create or replace function public.mark_lives_push(p_player_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_player_ids is null or array_length(p_player_ids, 1) is null then return 0; end if;
  update public.players set lives_full_notified_at = now()
   where id = any(p_player_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Writing to players
-- ---------------------------------------------------------------------------

/*
 * Who an email may go to.
 *
 * `unsubscribed_at` is checked here rather than in a route, so there is one
 * place that decides it and no way for a new sender to forget. Everything else
 * is a segment the caller filters on.
 */
create or replace view public.admin_email_targets as
select
  p.id                as player_id,
  p.email,
  p.created_at,
  p.last_seen_at,
  p.lives,
  public.activity_day() - public.activity_day(p.last_seen_at) as days_idle,
  coalesce(h.attempts, 0) as attempts,
  coalesce(o.spent_kobo, 0) as spent_kobo,
  exists (select 1 from public.push_subscriptions s where s.player_id = p.id) as has_push
from public.players p
left join (
  select player_id, sum(attempts_count) as attempts from public.hunts group by player_id
) h on h.player_id = p.id
left join (
  select player_id, sum(price_kobo) as spent_kobo
    from public.life_orders where status = 'paid' group by player_id
) o on o.player_id = p.id
where p.unsubscribed_at is null;

/** How big each segment is, so nobody sends blind. */
create or replace view public.admin_email_audience as
select
  count(*)                                                  as total,
  count(*) filter (where days_idle >= 3 and days_idle < 30) as idle,
  count(*) filter (where days_idle >= 30)                   as gone,
  count(*) filter (where attempts = 0)                      as never_played,
  count(*) filter (where spent_kobo > 0)                    as spenders,
  (select count(*) from public.players where unsubscribed_at is not null) as unsubscribed
from public.admin_email_targets;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.admin_best_attempts from public, anon, authenticated;
revoke all on public.admin_email_targets from public, anon, authenticated;
revoke all on public.admin_email_audience from public, anon, authenticated;
revoke execute on function public.players_due_lives_push(interval, int, int)
  from public, anon, authenticated;
revoke execute on function public.mark_lives_push(uuid[]) from public, anon, authenticated;
revoke execute on function public.unsubscribe_token(uuid) from public, anon, authenticated;
revoke execute on function public.unsubscribe_by_token(text) from public, anon, authenticated;

grant select on public.admin_best_attempts to service_role;
grant select on public.admin_email_targets to service_role;
grant select on public.admin_email_audience to service_role;

notify pgrst, 'reload schema';
