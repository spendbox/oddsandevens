-- ============================================================================
-- The box limit: make it editable, and start it at 10,000.
--
-- Run this after 0008_settings_and_limits.sql. Safe to run twice.
--
-- Two things were wrong with the limit as 0008 left it.
--
-- The first is that it could not actually be changed. `set_max_boxes` was a
-- bare `update ... where id`, which affects no rows at all if the single
-- settings row is missing — and then returns the number it was given anyway.
-- The admin screen took that as success and said "Saved", the row it reads
-- back was still absent, and the limit on screen never moved. A write that
-- reports a number it did not store is worse than one that fails: nothing
-- anywhere says the setting is not being kept. It is an upsert now, and it
-- returns what is in the table after the write rather than what it was asked
-- for, so the screen can only ever show the stored value.
--
-- The second is the number. 500 was low enough that a launch could reach it in
-- a week and every creator after that would be told boxes had run out — with
-- no way to lift it, because of the first problem. 10,000 is the ceiling now.
-- ============================================================================

-- The row the whole thing depends on. `where id` matches nothing without it.
insert into public.settings (id) values (true) on conflict (id) do nothing;

-- New installations start at ten thousand.
alter table public.settings
  alter column max_boxes set default 10000;

-- Existing ones move too, but only if nobody has chosen a number: 500 is the
-- old default, so a row still holding it has never been touched. Any other
-- value is somebody's decision and is left exactly where they put it.
update public.settings
   set max_boxes = 10000, updated_at = now()
 where id and max_boxes = 500;

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
