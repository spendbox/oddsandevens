-- ---------------------------------------------------------------------------
-- "Tell me when they're back"
-- ---------------------------------------------------------------------------
--
-- 0061 added the daily "your lives are full" push, for the player who has
-- drifted away and does not know a full pool is waiting. This adds the other
-- half: the player who is standing at an empty pool *right now*, is told the
-- refill is free and hourly, and asks to be told when it is done. Two things
-- had to change for that promise to be keepable.
--
--   **The pool was measured from a stale column.** `players.lives` is written
--   by `sync_lives`, which only runs when the player does something — so
--   somebody who quit at zero still reads as zero for as long as they stay
--   away, however many hours the clock has since handed them. The daily job
--   asked `lives >= life_cap` of that column and therefore skipped, almost
--   perfectly, the one group it exists for: the people who left *because* they
--   ran out. What it did reach were players who wandered off with a full pool,
--   for whom "your lives are back" is not even news.
--
--   **Asking to be told had nowhere to be recorded.** The daily job refuses
--   anybody seen in the last two days, which is right for an unsolicited nudge
--   and wrong for one somebody just asked for: a player who runs out this
--   evening is by definition here today. A watch is that request, and it is
--   what exempts them — once, for the pool they were actually waiting on.

-- ---------------------------------------------------------------------------
-- What the pool holds, without writing anything down
-- ---------------------------------------------------------------------------

/*
 * The lives a player would have if they turned up this second.
 *
 * The arithmetic is `sync_lives`', deliberately: whole regen periods since
 * `lives_accrued_at`, capped by `life_cap`. It differs only in doing no
 * writing, because reading a pool must not be a reason to take a row lock on
 * every idle player in the table.
 *
 * Anything asking "is somebody full?" about a player who is *not here* has to
 * use this. The stored column answers a different question — "what were they
 * holding when they last did something" — and for an absent player those two
 * numbers are almost never the same.
 */
create or replace function public.lives_now(p_player public.players)
returns int
language sql
stable
set search_path = public
as $$
  select least(
    public.life_cap(p_player),
    p_player.lives + greatest(
      floor(
        extract(epoch from (now() - p_player.lives_accrued_at))
        / extract(epoch from public.life_regen())
      )::int,
      0
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- The request
-- ---------------------------------------------------------------------------

/*
 * When they asked to be told, or null.
 *
 * A single timestamp rather than a boolean, so an unfilled watch can be aged
 * out and so the order it is served in is the order it was asked in. Cleared
 * the moment the push goes, because this is a request about one empty pool and
 * not a standing subscription — the switch in `/me` is where a standing
 * preference lives.
 */
alter table public.players
  add column if not exists lives_full_watch_at timestamptz;

create index if not exists players_lives_watch_idx
  on public.players (lives_full_watch_at) where lives_full_watch_at is not null;

/*
 * Ask to be told.
 *
 * Idempotent by design and not by accident: asking twice keeps the *first*
 * time, so that a player tapping the offer again cannot walk their own watch
 * forward past the ageing-out below.
 */
create or replace function public.watch_lives_full(p_player_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  update public.players
     set lives_full_watch_at = coalesce(lives_full_watch_at, now())
   where id = p_player_id
   returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

/** Stop waiting. What the switch going off in `/me` means for a pending ask. */
create or replace function public.unwatch_lives_full(p_player_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.players set lives_full_watch_at = null where id = p_player_id;
$$;

/*
 * Who asked, and is full now.
 *
 * The idle rule the daily job applies is deliberately *not* here. It exists to
 * keep an uninvited notification from reaching somebody who is already looking
 * at their life count; this notification was invited, by a person watching an
 * empty pool, and refusing to send it because they were here recently would
 * refuse it to everybody who ever asks.
 *
 * A watch nobody could satisfy is dropped after a fortnight — long enough that
 * a pool emptied and re-emptied all week still resolves, short enough that a
 * request made in March is not honoured in June.
 */
create or replace function public.players_watching_lives_full(
  p_stale interval default interval '14 days',
  p_limit int default 500
)
returns table (player_id uuid, email citext, lives int, lives_max int)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email, public.lives_now(p), public.life_cap(p)
    from public.players p
   where p.lives_full_watch_at is not null
     and p.lives_full_watch_at > now() - p_stale
     and public.lives_now(p) >= public.life_cap(p)
     and exists (select 1 from public.push_subscriptions s where s.player_id = p.id)
   order by p.lives_full_watch_at
   limit p_limit;
$$;

/*
 * Done. The watch is spent and the daily job is told they have just been
 * buzzed, so the two notifications cannot land on the same person in one day.
 */
create or replace function public.clear_lives_watch(p_player_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_player_ids is null or array_length(p_player_ids, 1) is null then return 0; end if;
  update public.players
     set lives_full_watch_at = null, lives_full_notified_at = now()
   where id = any(p_player_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- The daily nudge, measuring the pool properly
-- ---------------------------------------------------------------------------

/*
 * 0061's function with one column swapped for a function call, and it is the
 * difference between a job that works and one that only appeared to.
 *
 * `lives_now(p)` rather than `p.lives`, and `life_cap(p)` rather than the
 * stored count in the message: for the player this is written for — away for
 * days, last seen at zero — the stored count is the number they left on, and
 * the pool has been full for most of the time since.
 *
 * A player with a pending watch is left to `players_watching_lives_full`
 * rather than being picked up here, so that the two lists never send the same
 * person the same notification twice in one run.
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
  select p.id, p.email, public.lives_now(p), public.life_cap(p)
    from public.players p
   where public.lives_now(p) >= public.life_cap(p)
     and p.lives_full_watch_at is null
     and exists (select 1 from public.push_subscriptions s where s.player_id = p.id)
     and (p.lives_full_notified_at is null or p.lives_full_notified_at < now() - p_window)
     and (p.last_seen_at is null or p.last_seen_at < now() - make_interval(days => p_idle_days))
   order by p.last_seen_at desc nulls last
   limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
--
-- As everywhere else: these run as their owner and no browser role may call
-- them. The route that takes the request is the one holding the session that
-- says whose player row it is.

revoke execute on function public.lives_now(public.players) from public, anon, authenticated;
revoke execute on function public.watch_lives_full(uuid) from public, anon, authenticated;
revoke execute on function public.unwatch_lives_full(uuid) from public, anon, authenticated;
revoke execute on function public.players_watching_lives_full(interval, int)
  from public, anon, authenticated;
revoke execute on function public.clear_lives_watch(uuid[]) from public, anon, authenticated;

notify pgrst, 'reload schema';
