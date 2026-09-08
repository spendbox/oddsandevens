-- ============================================================================
-- A cap on how many boxes exist, and somewhere to keep settings like it.
--
-- Run this after 0007_self_win_and_stats.sql. Safe to run twice.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- settings — one row, holding the numbers an admin can change without a deploy.
--
-- A single row rather than a key/value table: there are a handful of these, they
-- all have different types, and columns give them names and defaults that the
-- database itself enforces. The `id` check is what keeps it to one row.
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id                boolean primary key default true check (id),

  -- The most boxes that may exist across the whole platform, ever.
  --
  -- Every open box is a standing ₦100,000 promise, and two of them when it is
  -- beaten. This is the ceiling on that exposure, and the one number worth
  -- being able to change in a hurry without waiting for a deploy.
  max_boxes         integer not null default 500 check (max_boxes >= 0),

  updated_at        timestamptz not null default now()
);

insert into public.settings (id) values (true) on conflict (id) do nothing;

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
-- set_max_boxes — the admin's way to move the ceiling.
-- ---------------------------------------------------------------------------
create or replace function public.set_max_boxes(p_max integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_max < 0 then
    raise exception 'a box limit cannot be negative';
  end if;

  update public.settings
     set max_boxes = p_max, updated_at = now()
   where id;

  return p_max;
end;
$$;

revoke all on function public.set_max_boxes(integer) from public, anon, authenticated;
grant execute on function public.set_max_boxes(integer) to service_role;
