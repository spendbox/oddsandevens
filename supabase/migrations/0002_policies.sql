-- ============================================================================
-- STEP 2 of 2, part B — row level security.
--
-- Run this after 0001_schema.sql.
--
-- The shape of it: a browser may READ its own things, and may READ any box
-- (a box link has to work for a stranger, or sharing it is pointless). A
-- browser may WRITE almost nothing. Spending a coin, issuing a pattern, judging
-- an answer and deciding a winner all happen in server routes holding the
-- service-role key, which bypasses these policies on purpose.
--
-- Turning RLS on with no policy for an operation denies that operation. So the
-- absence of an insert policy below is not an oversight — it is the rule.
-- ============================================================================

alter table public.profiles    enable row level security;
alter table public.topups      enable row level security;
alter table public.coin_ledger enable row level security;
alter table public.boxes       enable row level security;
alter table public.attempts    enable row level security;
alter table public.payouts     enable row level security;

-- ---------------------------------------------------------------------------
-- profiles — yours and nobody else's.
--
-- Names shown to other people (a box's creator, a winner, a leaderboard row)
-- are copied onto the box and attempt rows, so nothing here needs to be public.
-- ---------------------------------------------------------------------------
create policy "read own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "create own profile" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

-- A player may edit their display name and their bank details. The `coins`
-- column is in this table too, so the WITH CHECK below is doing real work: it
-- lets the row be updated, and the balance guard is that no policy grants a
-- browser the ability to change what coins is worth — see the trigger.
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Postgres has no per-column policies, so the balance is protected by a
-- trigger instead: an ordinary signed-in session simply cannot change it.
-- The service role, which is what the payment and game routes use, is exempt.
create or replace function public.guard_coin_balance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  claims text := current_setting('request.jwt.claims', true);
begin
  if new.coins is distinct from old.coins
     -- No claims at all means this is not a request from a browser: the SQL
     -- editor, a migration, a psql session. Those are already trusted.
     and claims is not null and claims <> ''
     and (claims::jsonb ->> 'role') is distinct from 'service_role'
  then
    raise exception 'coins can only be changed by Spendbox itself';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_coins
  before update on public.profiles
  for each row execute function public.guard_coin_balance();

-- ---------------------------------------------------------------------------
-- topups and the ledger — read your own money history, write none of it.
-- ---------------------------------------------------------------------------
create policy "read own topups" on public.topups
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "read own ledger" on public.coin_ledger
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- boxes — anyone with the link can look, including signed-out visitors. That
-- is the whole point of a share link.
--
-- Creating one is free and open to any signed-in person, as long as they put
-- their own id on it. Nobody updates a box from a browser: the winner, the
-- attempt count and the best level are all decided by the server.
-- ---------------------------------------------------------------------------
create policy "anyone can read boxes" on public.boxes
  for select to anon, authenticated
  using (true);

create policy "create own box" on public.boxes
  for insert to authenticated
  with check (creator_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- attempts — a player can read their own runs, and a creator can read the runs
-- against their own box, so both sides can see what happened. Neither can write
-- one: paying a coin and judging an answer are the server's job.
-- ---------------------------------------------------------------------------
create policy "read own attempts" on public.attempts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "creator reads attempts on their box" on public.attempts
  for select to authenticated
  using (
    exists (
      select 1 from public.boxes b
      where b.id = attempts.box_id
        and b.creator_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- payouts — you can see what you are owed. Marking it paid is done by hand, by
-- whoever runs Spendbox, with the service-role key.
-- ---------------------------------------------------------------------------
create policy "read own payouts" on public.payouts
  for select to authenticated
  using (user_id = (select auth.uid()));
