-- ============================================================================
-- The box limit: make it exist, make it editable, and start it at 10,000.
--
-- Safe to run twice, and safe to run on a database that never got
-- 0008_settings_and_limits.sql. That last part is the point of this file.
--
-- Three things were wrong with the limit as 0008 left it.
--
-- The first is that 0008 had not been applied to production at all, so
-- `public.settings` did not exist. The admin screen read nothing, showed a
-- limit of nothing, and the save called a function that was not there. Nothing
-- said so. A migration that has not run is invisible from the outside and
-- looks exactly like a broken screen, so this one repeats everything 0008 set
-- up rather than assuming it: same table, same policy, same cap trigger, each
-- guarded so that running both files in either order is fine.
--
-- The second is that even where 0008 had run, the limit could not be changed.
-- `set_max_boxes` was a bare `update ... where id`, which affects no rows at
-- all if the single settings row is missing — and then returned the number it
-- was given anyway. The admin screen took that as success and said "Saved",
-- the row it read back was still absent, and the limit on screen never moved.
-- A write that reports a number it did not store is worse than one that
-- fails: nothing anywhere says the setting is not being kept. It is an upsert
-- now, and it returns what is in the table after the write rather than what it
-- was asked for, so the screen can only ever show the stored value.
--
-- The third is the number. 500 was low enough that a launch could reach it in
-- a week and every creator after that would be told boxes had run out — with
-- no way to lift it, because of the first two problems. 10,000 is the ceiling.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- settings — one row, holding the numbers an admin can change without a deploy.
--
-- A single row rather than a key/value table: there are a handful of these,
-- they all have different types, and columns give them names and defaults that
-- the database itself enforces. The `id` check is what keeps it to one row.
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id                boolean primary key default true check (id),

  -- The most boxes that may exist across the whole platform, ever.
  --
  -- Every open box is a standing ₦100,000 promise, and two of them when it is
  -- beaten. This is the ceiling on that exposure, and the one number worth
  -- being able to change in a hurry without waiting for a deploy.
  max_boxes         integer not null default 10000 check (max_boxes >= 0),

  updated_at        timestamptz not null default now()
);

-- Where 0008 did run, the column still carries its old default. Move it.
alter table public.settings
  alter column max_boxes set default 10000;

-- The row the whole thing depends on: `where id` matches nothing without it.
insert into public.settings (id) values (true) on conflict (id) do nothing;

-- Existing rows move to the new number too, but only from exactly 500 — that
-- is 0008's default, so a row still holding it has never been touched. Any
-- other value is somebody's decision and is left exactly where they put it.
update public.settings
   set max_boxes = 10000, updated_at = now()
 where id and max_boxes = 500;

alter table public.settings enable row level security;

-- Anyone may read the cap: the dashboard tells a creator when boxes have run
-- out, and that is not a secret. Only the server writes it.
drop policy if exists "anyone can read settings" on public.settings;
create policy "anyone can read settings" on public.settings
  for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Enforce the cap in the database, not in the app.
--
-- Two people creating the last box at the same moment is a race, and an app
-- that counts and then inserts loses it. A trigger runs inside the same
-- transaction as the insert, so the count it sees is the one that matters.
--
-- Counting every box ever made, not just the open ones: the cap is on how much
-- the platform has committed to in total, and a box that has been beaten has
-- already cost its ₦200,000.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_box_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap   integer;
  v_count integer;
begin
  select max_boxes into v_cap from public.settings where id;
  if v_cap is null then return new; end if;

  select count(*) into v_count from public.boxes;

  if v_count >= v_cap then
    raise exception 'box limit reached'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists boxes_enforce_cap on public.boxes;
create trigger boxes_enforce_cap
  before insert on public.boxes
  for each row execute function public.enforce_box_cap();

-- ---------------------------------------------------------------------------
-- set_max_boxes — the admin's way to move the ceiling, this time for real.
--
-- Upserts rather than updates, so a database whose settings row went missing
-- gets one instead of quietly discarding the write, and returns the value read
-- back out of the table so the caller reports what is stored rather than what
-- it hoped for.
-- ---------------------------------------------------------------------------
create or replace function public.set_max_boxes(p_max integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stored integer;
begin
  if p_max is null then
    raise exception 'a box limit is required';
  end if;

  if p_max < 0 then
    raise exception 'a box limit cannot be negative';
  end if;

  insert into public.settings (id, max_boxes, updated_at)
       values (true, p_max, now())
  on conflict (id) do update
          set max_boxes = excluded.max_boxes,
              updated_at = now()
    returning max_boxes into v_stored;

  return v_stored;
end;
$$;

revoke all on function public.set_max_boxes(integer) from public, anon, authenticated;
grant execute on function public.set_max_boxes(integer) to service_role;
