-- Teams, second pass: who may do what, messages that can be corrected, and
-- one cheap question a client can ask about all of its teams at once.
--
-- Three things, and they are separable:
--
--  1. **Roles.** Somebody has to be able to take a person out of a team, and
--     it cannot be everybody. The owner is an admin by construction and can
--     never be removed; anybody else is a member until an admin says
--     otherwise. Adding people, removing them and handing out the badge are
--     all admin-only, and the policies below are where that is true — not
--     the interface, which is only where it is *said*.
--
--  2. **Messages that can be corrected.** A chat nobody can fix a typo in is
--     a chat with a correction under every third line. Editing keeps the
--     row and stamps `edited_at`, deleting keeps it and stamps `deleted_at`,
--     and a reply points at what it is answering — which is also how a task
--     written in an answer knows whose it is.
--
--  3. **`team_pulse()`.** One call that says, for every team you are in, when
--     the last message was and who wrote it. The alternative is a query per
--     team every minute, which is exactly the kind of thing that turns a
--     fast app into a slow one three teams later.

/* ------------------------------------------------------------------ roles */

alter table public.team_members
  add column if not exists role text not null default 'member';

-- Whether you may change this team: add people, remove them, rename it.
--
-- The owner is always an admin whatever the member row says, so a team can
-- never end up with nobody able to change it. Security definer for the same
-- reason `in_team` is: a policy on team_members that reads team_members to
-- decide is infinitely recursive.
create or replace function public.is_team_admin(team uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.teams t where t.id = team and t.owner = auth.uid())
    or exists (
      select 1 from public.team_members m
      where m.team_id = team and m.user_id = auth.uid() and m.role = 'admin'
    );
$$;

grant execute on function public.is_team_admin(uuid) to authenticated;

-- Adding somebody is an admin's job now, not any member's.
drop policy if exists "members can invite" on public.team_members;
drop policy if exists "admins can invite" on public.team_members;
create policy "admins can invite" on public.team_members
  for insert with check (public.is_team_admin(team_id));

-- And so is taking them out. The owner is not removable by anybody,
-- including themselves: a team with no owner has no admin of last resort.
drop policy if exists "owner can remove" on public.team_members;
drop policy if exists "admins can remove" on public.team_members;
create policy "admins can remove" on public.team_members
  for delete using (
    public.is_team_admin(team_id)
    and user_id is distinct from (select t.owner from public.teams t where t.id = team_id)
  );

-- Handing out the badge, or taking it back. `with check` on the same
-- condition is what stops a member promoting themselves in one update.
drop policy if exists "admins can change a role" on public.team_members;
create policy "admins can change a role" on public.team_members
  for update using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));

-- Renaming and deleting a team: any admin, not only whoever made it.
drop policy if exists "owner can rename" on public.teams;
drop policy if exists "admins can rename" on public.teams;
create policy "admins can rename" on public.teams
  for update using (public.is_team_admin(id)) with check (public.is_team_admin(id));

/* --------------------------------------------------------------- messages */

alter table public.team_messages
  add column if not exists edited_at bigint,
  add column if not exists deleted_at bigint,
  -- What this message is answering. A reply is how a task written as an
  -- answer knows whose it is: "yes, by Thursday" under Ada's question is
  -- Ada's job, and nobody wants to type her name again to say so.
  add column if not exists reply_to uuid references public.team_messages (id) on delete set null;

-- Your own words are yours to correct. An admin may take a message down —
-- somebody has to be able to — but nobody may edit anybody else's: a chat
-- where your words can be rewritten by another person is not a record.
drop policy if exists "authors can correct their own" on public.team_messages;
create policy "authors can correct their own" on public.team_messages
  for update using (
    public.in_team(team_id) and (auth.uid() = author or public.is_team_admin(team_id))
  )
  with check (
    public.in_team(team_id) and (auth.uid() = author or public.is_team_admin(team_id))
  );

/* ------------------------------------------------------------- the pulse */

-- When each of my teams last had something said in it.
--
-- One round trip for every team, rather than one per team per minute. It is
-- what the dot on the notes screen is read from: the client keeps, on the
-- device, when it last looked at each team, and anything newer than that is
-- unread. That comparison is deliberately not stored on the server — it is
-- a fact about this screen, it changes constantly, and writing a row every
-- time somebody glances at a chat is a write per glance.
create or replace function public.team_pulse()
returns table (team_id uuid, name text, last_at bigint, last_author text, messages bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.name,
    coalesce(max(m.created_at), 0)::bigint,
    coalesce(
      (select m2.author_name from public.team_messages m2
        where m2.team_id = t.id and m2.deleted_at is null
        order by m2.created_at desc limit 1),
      ''
    ),
    count(m.id)::bigint
  from public.teams t
  left join public.team_messages m
    on m.team_id = t.id and m.deleted_at is null
  where exists (
    select 1 from public.team_members mem
    where mem.team_id = t.id and mem.user_id = auth.uid()
  )
  group by t.id, t.name;
$$;

grant execute on function public.team_pulse() to authenticated;

/* ---------------------------------------------------- the shared team page */

-- The name of a team, for somebody who has been sent its link and is not in
-- it yet.
--
-- Nothing else: not its members, not a message, not a task. The page at /t/
-- <id> exists to say which team you are being asked to sign in for, and a
-- function that returned any more than that would make the link worth
-- guessing at. Membership still comes from an admin adding your address —
-- the link is a way in to the sign-in page, never a way into the team.
create or replace function public.team_name(team uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select t.name from public.teams t where t.id = team;
$$;

grant execute on function public.team_name(uuid) to anon, authenticated;
