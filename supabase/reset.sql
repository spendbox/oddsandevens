-- ============================================================================
-- STEP 1 of 2 — wipe the old project clean.
--
-- Paste this whole file into Supabase → SQL Editor and run it, BEFORE running
-- the files in supabase/migrations/. It removes every table the previous app
-- (Forge) created, plus Spendbox's own tables, so the setup starts on an empty
-- database.
--
-- It does NOT touch auth.users, so existing sign-ins survive. To clear those
-- too, delete the users afterwards in Supabase → Authentication → Users.
--
-- Safe to run more than once: nothing here fails on a table that isn't there.
-- ============================================================================

-- Spendbox's own tables, in case you are re-running the setup. Children first.
drop table if exists public.payouts     cascade;
drop table if exists public.attempts    cascade;
drop table if exists public.boxes       cascade;
drop table if exists public.coin_ledger cascade;
drop table if exists public.topups      cascade;

-- Tables left behind by Forge.
drop table if exists public.purchases    cascade;
drop table if exists public.tool_entries cascade;
drop table if exists public.tool_records cascade;
drop table if exists public.tool_runs    cascade;
drop table if exists public.tools        cascade;

-- profiles is shared by both apps and its shape changes completely, so it goes
-- last and comes back in 0001_schema.sql.
drop table if exists public.profiles cascade;

-- Functions and triggers either app may have installed.
drop trigger  if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user()        cascade;
drop function if exists public.touch_tool()             cascade;
drop function if exists public.bump_run_count(uuid)     cascade;
drop function if exists public.bump_view_count(uuid)    cascade;
