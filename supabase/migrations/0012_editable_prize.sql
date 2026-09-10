-- ============================================================================
-- The prize an admin can move, and the trigger that makes it stick.
--
-- Run this after 0011_no_free_replay_on_your_own_box.sql. Safe to run twice.
--
-- Until now ₦100,000 was a constant in the app (PRIZE_NAIRA in src/lib/money.ts)
-- and a column default in the database, which meant changing what a box is
-- worth needed a deploy — the one thing the box limit in 0008/0009 already
-- taught us not to do with a number the person running this site has to be able
-- to move in a hurry.
--
-- Two things here, and the second is the one that matters.
--
-- The prize joins `settings`, alongside the box limit, so it can be changed
-- from /admin/users the same way. `set_prize` is the writer, and like
-- `set_max_boxes` it upserts and returns what is stored rather than what it was
-- asked for, so the screen can only ever report the truth.
--
-- And a box takes its prize from that row at the moment it is inserted, in a
-- trigger, rather than from whatever the insert asked for. Boxes are created
-- through the caller's own Supabase client, so `prize_naira` arrives in a
-- payload a signed-in user's session put together — exactly the shape of thing
-- this codebase does not let the client decide. The app still sends the value
-- it believes in and the trigger still overrules it, which is the same
-- arrangement as the price of a game going into `start_attempt`.
--
-- What this deliberately does NOT do is change the prize on boxes that already
-- exist. An open box is a standing promise to everyone who has paid to play it,
-- and the amount is the promise. Moving the ceiling changes what the next box
-- is worth; it cannot rewrite what the last one said.
-- ============================================================================

-- The row everything below depends on. `where id` matches nothing without it.
insert into public.settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- settings.prize_naira — what a box made from now on is worth.
-- ---------------------------------------------------------------------------
alter table public.settings
  add column if not exists prize_naira integer not null default 100000;

-- Named, so it can be re-run: an unnamed check would stack up a new constraint
-- every time this migration is applied.
alter table public.settings
  drop constraint if exists settings_prize_positive;
alter table public.settings
  add constraint settings_prize_positive check (prize_naira > 0);

-- ---------------------------------------------------------------------------
-- Every new box is worth whatever the settings row says.
--
-- Before insert, so the value written is the one the row is created with —
-- there is no window in which a box exists carrying a prize nobody set.
--
-- If the settings row is somehow missing, the insert keeps the prize it came
-- with rather than failing: a database that has lost its settings row should
-- still let people make boxes at the default, and the admin screen already says
-- loudly when that row cannot be read.
-- ---------------------------------------------------------------------------
create or replace function public.set_box_prize()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prize integer;
begin
  select prize_naira into v_prize from public.settings where id;

  if v_prize is not null and v_prize > 0 then
    new.prize_naira := v_prize;
  end if;

  return new;
end;
$$;

drop trigger if exists boxes_set_prize on public.boxes;
create trigger boxes_set_prize
  before insert on public.boxes
  for each row execute function public.set_box_prize();

-- ---------------------------------------------------------------------------
-- set_prize — the admin's way to move it.
--
-- Upserts, returns the stored value, and refuses zero: a box worth nothing is
-- not a cheaper box, it is a game with no reason to play it, and the check
-- constraint on the column would refuse the write anyway. Saying so here gives
-- the admin screen a sentence instead of a constraint violation.
-- ---------------------------------------------------------------------------
create or replace function public.set_prize(p_naira integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stored integer;
begin
  if p_naira is null then
    raise exception 'a prize is required';
  end if;

  if p_naira <= 0 then
    raise exception 'a prize has to be more than nothing';
  end if;

  insert into public.settings (id, prize_naira, updated_at)
       values (true, p_naira, now())
  on conflict (id) do update
          set prize_naira = excluded.prize_naira,
              updated_at = now()
    returning prize_naira into v_stored;

  return v_stored;
end;
$$;

revoke all on function public.set_prize(integer) from public, anon, authenticated;
grant execute on function public.set_prize(integer) to service_role;
