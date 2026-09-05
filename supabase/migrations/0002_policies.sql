-- Row level security, counters, and the small amount of logic that belongs in
-- the database rather than the app.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Security definer so that policies on other tables can ask "is this person in
-- the pursuit?" without the memberships policy asking the same question back.
create or replace function public.is_member(p_pursuit uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where pursuit_id = p_pursuit and user_id = auth.uid()
  );
$$;

create or replace function public.is_steward(p_pursuit uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where pursuit_id = p_pursuit and user_id = auth.uid() and role = 'steward'
  ) or exists (
    select 1 from public.pursuits
    where id = p_pursuit and created_by = auth.uid()
  );
$$;

-- A new sign-up gets a profile immediately, with a handle derived from their
-- email and de-duplicated. Without this, a signed-in user with no profile row
-- is a broken state every query has to defend against.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_handle text;
  final_handle text;
  suffix integer := 0;
begin
  base_handle := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]', '', 'g');
  if base_handle = '' or base_handle is null then
    base_handle := 'member';
  end if;
  base_handle := left(base_handle, 20);
  final_handle := base_handle;

  while exists (select 1 from public.profiles where handle = final_handle) loop
    suffix := suffix + 1;
    final_handle := base_handle || suffix::text;
  end loop;

  insert into public.profiles (id, handle, full_name)
  values (
    new.id,
    final_handle,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Counter triggers
-- ---------------------------------------------------------------------------

create or replace function public.bump_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta integer;
  target uuid;
begin
  if tg_op = 'INSERT' then
    delta := 1;
  else
    delta := -1;
  end if;

  if tg_argv[0] = 'pursuit_members' then
    target := coalesce(new.pursuit_id, old.pursuit_id);
    update public.pursuits set member_count = greatest(0, member_count + delta) where id = target;
  elsif tg_argv[0] = 'post_replies' then
    target := coalesce(new.post_id, old.post_id);
    update public.posts set reply_count = greatest(0, reply_count + delta) where id = target;
  elsif tg_argv[0] = 'post_useful' then
    target := coalesce(new.post_id, old.post_id);
    update public.posts set useful_count = greatest(0, useful_count + delta) where id = target;
  elsif tg_argv[0] = 'resource_votes' then
    target := coalesce(new.resource_id, old.resource_id);
    update public.resources set vote_count = greatest(0, vote_count + delta) where id = target;
  elsif tg_argv[0] = 'event_rsvps' then
    target := coalesce(new.event_id, old.event_id);
    update public.events set rsvp_count = greatest(0, rsvp_count + delta) where id = target;
  end if;

  return null;
end;
$$;

drop trigger if exists memberships_count on public.memberships;
create trigger memberships_count after insert or delete on public.memberships
  for each row execute function public.bump_counter('pursuit_members');
drop trigger if exists replies_count on public.replies;
create trigger replies_count after insert or delete on public.replies
  for each row execute function public.bump_counter('post_replies');
drop trigger if exists post_useful_count on public.post_useful;
create trigger post_useful_count after insert or delete on public.post_useful
  for each row execute function public.bump_counter('post_useful');
drop trigger if exists resource_votes_count on public.resource_votes;
create trigger resource_votes_count after insert or delete on public.resource_votes
  for each row execute function public.bump_counter('resource_votes');
drop trigger if exists event_rsvps_count on public.event_rsvps;
create trigger event_rsvps_count after insert or delete on public.event_rsvps
  for each row execute function public.bump_counter('event_rsvps');

-- A new member starts at the first stage of the pursuit unless they say
-- otherwise, so the progress board is never full of people at "no stage".
create or replace function public.default_membership_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage_id is null then
    select id into new.stage_id
    from public.stages
    where pursuit_id = new.pursuit_id
    order by position
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_default_stage on public.memberships;
create trigger memberships_default_stage before insert on public.memberships
  for each row execute function public.default_membership_stage();

create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return null;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation after insert on public.messages
  for each row execute function public.touch_conversation();

-- ---------------------------------------------------------------------------
-- Collective progress
-- ---------------------------------------------------------------------------

-- How many people are standing at each stage of the journey. This is the
-- shape of the Progress board: IDEA 1,240 / VALIDATING 842 / BUILDING 1,104.
create or replace function public.stage_counts(p_pursuit uuid)
returns table (stage_id uuid, stage_name text, stage_position integer, people integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.position,
         (select count(*)::integer from public.memberships m where m.stage_id = s.id)
  from public.stages s
  where s.pursuit_id = p_pursuit
  order by s.position;
$$;

-- The pursuit's collective progress: the average of everyone pursuing it.
create or replace function public.collective_progress(p_pursuit uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(round(avg(progress))::integer, 0)
  from public.memberships
  where pursuit_id = p_pursuit;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.pursuits         enable row level security;
alter table public.stages           enable row level security;
alter table public.memberships      enable row level security;
alter table public.posts            enable row level security;
alter table public.replies          enable row level security;
alter table public.post_useful      enable row level security;
alter table public.progress_updates enable row level security;
alter table public.asks             enable row level security;
alter table public.ask_responses    enable row level security;
alter table public.resources        enable row level security;
alter table public.resource_votes   enable row level security;
alter table public.events           enable row level security;
alter table public.event_rsvps      enable row level security;
alter table public.connections      enable row level security;
alter table public.conversations    enable row level security;
alter table public.messages         enable row level security;
alter table public.notifications    enable row level security;

-- Profiles: everyone signed in can see everyone. Finding people is the point.
create policy "profiles readable" on public.profiles
  for select to authenticated using (true);
create policy "own profile insert" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Pursuits and their shape are readable by any signed-in member of the site;
-- writing is limited to whoever set the pursuit up.
create policy "pursuits readable" on public.pursuits
  for select to authenticated using (true);
create policy "pursuits create" on public.pursuits
  for insert to authenticated with check (created_by = auth.uid());
create policy "pursuits update" on public.pursuits
  for update to authenticated using (public.is_steward(id)) with check (public.is_steward(id));

create policy "stages readable" on public.stages
  for select to authenticated using (true);
create policy "stages write" on public.stages
  for all to authenticated
  using (public.is_steward(pursuit_id)) with check (public.is_steward(pursuit_id));

create policy "memberships readable" on public.memberships
  for select to authenticated using (true);
create policy "join a pursuit" on public.memberships
  for insert to authenticated with check (user_id = auth.uid());
create policy "update own membership" on public.memberships
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "leave a pursuit" on public.memberships
  for delete to authenticated using (user_id = auth.uid());

-- Contributions: readable by anyone signed in, writable only by members of the
-- pursuit, editable only by the person who wrote them.
create policy "posts readable" on public.posts
  for select to authenticated using (true);
create policy "posts create" on public.posts
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_member(pursuit_id));
create policy "posts update own" on public.posts
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "posts delete own" on public.posts
  for delete to authenticated using (author_id = auth.uid() or public.is_steward(pursuit_id));

create policy "replies readable" on public.replies
  for select to authenticated using (true);
create policy "replies create" on public.replies
  for insert to authenticated with check (author_id = auth.uid());
create policy "replies delete own" on public.replies
  for delete to authenticated using (author_id = auth.uid());

create policy "useful readable" on public.post_useful
  for select to authenticated using (true);
create policy "useful toggle" on public.post_useful
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "progress readable" on public.progress_updates
  for select to authenticated using (true);
create policy "progress create" on public.progress_updates
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(pursuit_id));

create policy "asks readable" on public.asks
  for select to authenticated using (true);
create policy "asks create" on public.asks
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(pursuit_id));
create policy "asks update own" on public.asks
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "asks delete own" on public.asks
  for delete to authenticated using (user_id = auth.uid());

create policy "ask responses readable" on public.ask_responses
  for select to authenticated using (true);
create policy "ask responses create" on public.ask_responses
  for insert to authenticated with check (user_id = auth.uid());
create policy "ask responses delete own" on public.ask_responses
  for delete to authenticated using (user_id = auth.uid());

create policy "resources readable" on public.resources
  for select to authenticated using (true);
create policy "resources create" on public.resources
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(pursuit_id));
create policy "resources update own" on public.resources
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "resources delete own" on public.resources
  for delete to authenticated using (user_id = auth.uid() or public.is_steward(pursuit_id));

create policy "resource votes readable" on public.resource_votes
  for select to authenticated using (true);
create policy "resource votes toggle" on public.resource_votes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "events readable" on public.events
  for select to authenticated using (true);
create policy "events create" on public.events
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_member(pursuit_id));
create policy "events update own" on public.events
  for update to authenticated
  using (created_by = auth.uid() or public.is_steward(pursuit_id))
  with check (created_by = auth.uid() or public.is_steward(pursuit_id));
create policy "events delete own" on public.events
  for delete to authenticated using (created_by = auth.uid() or public.is_steward(pursuit_id));

create policy "rsvps readable" on public.event_rsvps
  for select to authenticated using (true);
create policy "rsvps toggle" on public.event_rsvps
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Connections are private to the two people involved.
create policy "connections visible to both" on public.connections
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy "connections request" on public.connections
  for insert to authenticated with check (requester_id = auth.uid());
create policy "connections answer" on public.connections
  for update to authenticated
  using (addressee_id = auth.uid() or requester_id = auth.uid())
  with check (addressee_id = auth.uid() or requester_id = auth.uid());
create policy "connections withdraw" on public.connections
  for delete to authenticated using (requester_id = auth.uid());

create policy "conversations of mine" on public.conversations
  for select to authenticated using (user_a = auth.uid() or user_b = auth.uid());
create policy "conversations create" on public.conversations
  for insert to authenticated with check (user_a = auth.uid() or user_b = auth.uid());

create policy "messages in my conversations" on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ));
create policy "messages send" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ));
create policy "messages mark read" on public.messages
  for update to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ));

create policy "own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "own notifications update" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications create" on public.notifications
  for insert to authenticated with check (true);
