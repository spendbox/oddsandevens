-- Teams: a chat that turns into a list of things to do.
--
-- Four tables and one idea. People talk in a chat about what has to happen;
-- the app reads each message as it is sent and writes down the tasks it can
-- see in it. Nothing is invented — a task has to be a thing somebody actually
-- said — and everything can be corrected by hand, because a list of work that
-- cannot be corrected is one nobody trusts.
--
-- This is the first thing in Pad that is not private by construction, so the
-- policies below are the whole of its security and they are written to be
-- read: you see a team's messages and tasks if and only if you are in that
-- team, and membership is checked by one function so there is one place to
-- get it wrong rather than twelve.

/* ------------------------------------------------------------------ teams */

create table if not exists public.teams (
  id uuid primary key,
  name text not null default '',
  -- Whoever made it. They cannot be removed from it, and only they can
  -- delete it: a team anybody can dissolve is a team anybody can take
  -- everybody else's work away from.
  owner uuid not null references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null
);

/* ---------------------------------------------------------------- members */

-- A row here is either a member (user_id set) or an invitation (user_id null
-- and an email). Inviting by email is the only way in, because the anon key
-- cannot look up a person by address — auth.users is not readable from a
-- browser and must never be. So the invitation waits, and `claim_invites()`
-- below attaches it the first time that address signs in.
create table if not exists public.team_members (
  id uuid primary key,
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  email text not null default '',
  -- What to call them in the chat and on a task. Their own name if they have
  -- set one, the part of their address before the @ otherwise.
  name text not null default '',
  created_at bigint not null
);

-- One row per address per team, so inviting somebody twice is not two rows
-- and two names for the same person.
create unique index if not exists team_members_team_email_idx
  on public.team_members (team_id, lower(email));
create index if not exists team_members_user_idx on public.team_members (user_id);

/* --------------------------------------------------------------- messages */

create table if not exists public.team_messages (
  id uuid primary key,
  team_id uuid not null references public.teams (id) on delete cascade,
  author uuid not null references auth.users (id) on delete cascade,
  -- Copied onto the row rather than joined at read time: a chat is read far
  -- more often than a name changes, and a message whose author has left the
  -- team still has to say who wrote it.
  author_name text not null default '',
  body text not null default '',
  created_at bigint not null
);

create index if not exists team_messages_team_idx
  on public.team_messages (team_id, created_at desc);

/* ------------------------------------------------------------------ tasks */

create table if not exists public.team_tasks (
  id uuid primary key,
  team_id uuid not null references public.teams (id) on delete cascade,
  text text not null default '',
  -- Who it is for, when somebody was named with an @. Null is "nobody yet",
  -- which is an ordinary state and not a mistake.
  assignee uuid references auth.users (id) on delete set null,
  assignee_name text not null default '',
  -- In the words it was written in. "Friday" is not turned into a date here
  -- for the same reason it is not anywhere else in this app: which Friday
  -- was meant is not something this knows.
  due text not null default '',
  done boolean not null default false,
  created_at bigint not null,
  updated_at bigint not null,
  created_by uuid references auth.users (id) on delete set null,
  -- The message it came out of, so a task can always be traced back to the
  -- sentence somebody actually typed.
  source_message uuid references public.team_messages (id) on delete set null,
  -- A tombstone, like a note's: a delete has to reach the other devices
  -- rather than letting one of them push its copy back.
  deleted_at bigint
);

create index if not exists team_tasks_team_idx
  on public.team_tasks (team_id, updated_at desc);

/* --------------------------------------------------------------- the rule */

-- Whether you are in a team.
--
-- Security definer, and this is the important part: a policy on
-- `team_members` that reads `team_members` to decide is infinitely recursive,
-- and Postgres will tell you so at query time rather than at write time. One
-- function, called by every policy below, is also one place to be wrong
-- instead of twelve.
create or replace function public.in_team(team uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = team and m.user_id = auth.uid()
  );
$$;

grant execute on function public.in_team(uuid) to authenticated;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_messages enable row level security;
alter table public.team_tasks enable row level security;

-- Teams. You see the ones you are in; you make your own; the owner alone can
-- rename or delete one.
drop policy if exists "read teams you are in" on public.teams;
create policy "read teams you are in" on public.teams
  for select using (public.in_team(id) or auth.uid() = owner);

drop policy if exists "make your own team" on public.teams;
create policy "make your own team" on public.teams
  for insert with check (auth.uid() = owner);

drop policy if exists "owner can rename" on public.teams;
create policy "owner can rename" on public.teams
  for update using (auth.uid() = owner) with check (auth.uid() = owner);

drop policy if exists "owner can delete" on public.teams;
create policy "owner can delete" on public.teams
  for delete using (auth.uid() = owner);

-- Members. Anybody in the team can see who is in it and add somebody; only
-- the owner can take a person out, and nobody can take the owner out.
drop policy if exists "read the team's members" on public.team_members;
create policy "read the team's members" on public.team_members
  for select using (
    public.in_team(team_id)
    or user_id = auth.uid()
    or exists (select 1 from public.teams t where t.id = team_id and t.owner = auth.uid())
  );

drop policy if exists "members can invite" on public.team_members;
create policy "members can invite" on public.team_members
  for insert with check (
    public.in_team(team_id)
    or exists (select 1 from public.teams t where t.id = team_id and t.owner = auth.uid())
  );

drop policy if exists "owner can remove" on public.team_members;
create policy "owner can remove" on public.team_members
  for delete using (
    exists (select 1 from public.teams t where t.id = team_id and t.owner = auth.uid())
    and user_id is distinct from (select t.owner from public.teams t where t.id = team_id)
  );

-- Messages. Read by the team, written as yourself, and never edited: a chat
-- somebody can rewrite afterwards is not a record of what was said.
drop policy if exists "read the team's messages" on public.team_messages;
create policy "read the team's messages" on public.team_messages
  for select using (public.in_team(team_id));

drop policy if exists "members can write" on public.team_messages;
create policy "members can write" on public.team_messages
  for insert with check (public.in_team(team_id) and auth.uid() = author);

-- Tasks. Read, made, changed and deleted by anybody in the team: this is
-- shared work, and a list where only the person who wrote a line can tick it
-- is a list that goes stale the first time somebody is on leave.
drop policy if exists "read the team's tasks" on public.team_tasks;
create policy "read the team's tasks" on public.team_tasks
  for select using (public.in_team(team_id));

drop policy if exists "members can add tasks" on public.team_tasks;
create policy "members can add tasks" on public.team_tasks
  for insert with check (public.in_team(team_id));

drop policy if exists "members can change tasks" on public.team_tasks;
create policy "members can change tasks" on public.team_tasks
  for update using (public.in_team(team_id)) with check (public.in_team(team_id));

/* ------------------------------------------------------------- invitations */

-- Picking up the invitations waiting for your address.
--
-- Called when somebody signs in. Security definer because the row it is
-- looking for has `user_id is null`, so the person it belongs to cannot yet
-- see it under any policy — which is the whole shape of an invitation, and
-- the reason "add them by email" can work at all from a browser.
--
-- It matches on the address the account is verified as, read from the token
-- rather than passed in, so it can only ever claim invitations addressed to
-- the person calling it.
create or replace function public.claim_invites()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  claimed integer;
begin
  update public.team_members m
  set user_id = auth.uid()
  where m.user_id is null
    and auth.email() is not null
    and lower(m.email) = lower(auth.email());
  get diagnostics claimed = row_count;
  return claimed;
end;
$$;

grant execute on function public.claim_invites() to authenticated;
