-- Nothing in this database answers to the anon key.
--
-- Every table here already has row level security on and, with one exception,
-- no policy — which is the right answer and, on its own, a slightly nervous
-- one. RLS is a switch. It can be turned off from the dashboard by anybody
-- with the project open, a `create table` in a future migration can forget it,
-- and Supabase's default privileges hand `anon` and `authenticated` full
-- SELECT/INSERT/UPDATE/DELETE on every new table in `public` — so RLS is the
-- *only* thing standing between the publishable key, which ships to every
-- browser, and `select secret from boxes`.
--
-- This migration removes that dependency. It takes the grants away as well, so
-- the two roles a browser can hold have no privilege to fall back on if a
-- policy is ever added by accident or RLS is ever switched off. The app is
-- unaffected: every query it makes runs as `service_role`, which keeps its
-- grant explicitly below.
--
-- The same argument applies to functions, and more sharply. A function is
-- `EXECUTE` to `PUBLIC` by default, and PostgREST exposes every one of them at
-- `/rest/v1/rpc/<name>`. Most already carry a hand-written revoke; the ones
-- that don't are the ones somebody forgot, which is exactly the failure this
-- is meant to survive. So it revokes the lot and grants back only the role the
-- server uses.
--
-- Written as loops over the catalogue rather than a list of names on purpose:
-- a list is a thing that goes stale, and the failure mode of a stale list here
-- is a function nobody remembers being callable by the entire internet.
--
-- Idempotent. Run it again after adding tables or functions and it will pick
-- up whatever is new.

-- ---------------------------------------------------------------------------
-- 1. Tables and views
-- ---------------------------------------------------------------------------

do $$
declare
  rel record;
begin
  for rel in
    select c.oid::regclass as ident, c.relkind, c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm')
       -- Anything an extension owns is the extension's business.
       and not exists (
         select 1 from pg_depend d
          where d.objid = c.oid and d.deptype = 'e'
       )
  loop
    execute format('revoke all on %s from anon, authenticated', rel.ident);
    execute format('grant all on %s to service_role', rel.ident);

    -- Belt to the braces above: a table with RLS on and no policy is closed to
    -- every role except one with BYPASSRLS, which is service_role and nothing
    -- a browser can hold.
    if rel.relkind in ('r', 'p') and not rel.relrowsecurity then
      execute format('alter table %s enable row level security', rel.ident);
    end if;
  end loop;
end $$;

-- Sequences too. Not a leak on their own, but `nextval` on an orders sequence
-- is a running total of how much has been sold.
do $$
declare
  seq record;
begin
  for seq in
    select c.oid::regclass as ident
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format('revoke all on sequence %s from anon, authenticated', seq.ident);
    execute format('grant all on sequence %s to service_role', seq.ident);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Functions
-- ---------------------------------------------------------------------------

/*
 * Extension functions are skipped, and that is not tidiness.
 *
 * `citext` and `pgcrypto` install their operators into `public` on Supabase,
 * and an operator is a function: revoking EXECUTE on `citext_eq` from PUBLIC
 * would break every comparison against `players.email` for every role that
 * isn't explicitly granted, including roles this migration has never heard of.
 * The rule is: revoke what we wrote, leave what we installed.
 */
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as ident
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind in ('f', 'p')
       and not exists (
         select 1 from pg_depend d
          where d.objid = p.oid and d.deptype = 'e'
       )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.ident);
    execute format('grant execute on function %s to service_role', fn.ident);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. And for whatever comes next
-- ---------------------------------------------------------------------------

/*
 * Default privileges, so a future `create table` in `public` is closed the
 * moment it exists rather than the next time somebody remembers.
 *
 * These only apply to objects created by the role that runs migrations, which
 * is the one that matters — a table made by hand in the dashboard is made by
 * the same role.
 */
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

notify pgrst, 'reload schema';
