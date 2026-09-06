-- Standing, and a journey you finish one stage at a time.
--
-- Two changes to how a pursuit works.
--
-- First, points. You earn them when other people find you worth their time —
-- they connect with you, they mark what you wrote as useful, they upvote a
-- resource you shared. Points are never shown inside a pursuit, only on a
-- person's own profile and on the cards suggesting who to meet, so that a
-- number does not colour how people read the discussion.
--
-- Second, progress. A self-reported "62%" said nothing. A stage is either
-- behind you or ahead of you, and to put one behind you, you write down what
-- you actually did — publicly, for the people still standing where you were.

-- ---------------------------------------------------------------------------
-- Points
-- ---------------------------------------------------------------------------

alter table public.profiles    add column if not exists points integer not null default 0;
alter table public.memberships add column if not exists points integer not null default 0;

-- An append-only ledger. The unique key is what makes points reversible:
-- un-marking a post as useful deletes that person's event and the totals follow.
create table if not exists public.point_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles on delete cascade,
  actor_id     uuid references public.profiles on delete set null,
  pursuit_id   uuid references public.pursuits on delete cascade,
  kind         text not null,
  points       integer not null,
  subject_type text not null default 'none',
  subject_id   uuid,
  created_at   timestamptz not null default now()
);

create unique index if not exists point_events_once
  on public.point_events (user_id, kind, subject_type, coalesce(subject_id, user_id), coalesce(actor_id, user_id));
create index if not exists point_events_user_idx on public.point_events (user_id, created_at desc);
create index if not exists point_events_pursuit_idx on public.point_events (pursuit_id, user_id);

-- Cached totals, so no page has to add up a ledger to render a badge.
create or replace function public.apply_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta integer;
  row_user uuid;
  row_pursuit uuid;
begin
  if tg_op = 'INSERT' then
    delta := new.points; row_user := new.user_id; row_pursuit := new.pursuit_id;
  else
    delta := -old.points; row_user := old.user_id; row_pursuit := old.pursuit_id;
  end if;

  update public.profiles set points = greatest(0, points + delta) where id = row_user;

  if row_pursuit is not null then
    update public.memberships set points = greatest(0, points + delta)
    where pursuit_id = row_pursuit and user_id = row_user;
  end if;

  return null;
end;
$$;

drop trigger if exists point_events_apply on public.point_events;
create trigger point_events_apply after insert or delete on public.point_events
  for each row execute function public.apply_points();

-- What each thing is worth. Kept in the database so the rules are one thing,
-- not a number repeated across the app.
create or replace function public.points_for(p_kind text)
returns integer language sql immutable as $$
  select case p_kind
    when 'connection_received' then 5   -- somebody sought you out
    when 'connection_made'     then 1
    when 'post_useful'         then 2
    when 'reply_useful'        then 2
    when 'resource_upvote'     then 3
    when 'stage_completed'     then 10
    when 'quiz_taken'          then 2   -- someone completed a quiz you wrote
    when 'tool_used'           then 2
    else 0
  end;
$$;

-- Who may add to a pursuit's knowledge base: twenty points earned inside this
-- pursuit, or a hundred anywhere. Standing has to come before publishing.
create or replace function public.can_add_resources(p_pursuit uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
      select points from public.memberships
      where pursuit_id = p_pursuit and user_id = auth.uid()
    ), 0) >= 20
    or coalesce((select points from public.profiles where id = auth.uid()), 0) >= 100;
$$;

-- ---------------------------------------------------------------------------
-- Marking a reply useful — the other half of "positive public engagement"
-- ---------------------------------------------------------------------------

alter table public.replies add column if not exists useful_count integer not null default 0;

create table if not exists public.reply_useful (
  reply_id uuid not null references public.replies on delete cascade,
  user_id  uuid not null references public.profiles on delete cascade,
  primary key (reply_id, user_id)
);

drop trigger if exists reply_useful_count on public.reply_useful;
create trigger reply_useful_count after insert or delete on public.reply_useful
  for each row execute function public.bump_counter('reply_useful');

-- ---------------------------------------------------------------------------
-- Stages you finish, rather than a percentage you assert
-- ---------------------------------------------------------------------------

-- Reflections are posts, so they inherit replies and useful marks for free.
alter table public.posts drop constraint if exists posts_kind_check;
alter table public.posts add constraint posts_kind_check
  check (kind in ('question', 'update', 'insight', 'win', 'reflection'));

create table if not exists public.stage_completions (
  id             uuid primary key default gen_random_uuid(),
  pursuit_id     uuid not null references public.pursuits on delete cascade,
  user_id        uuid not null references public.profiles on delete cascade,
  stage_id       uuid not null references public.stages on delete cascade,
  what_i_did     text not null,
  what_was_hard  text not null default '',
  post_id        uuid references public.posts on delete set null,
  completed_at   timestamptz not null default now(),
  unique (user_id, stage_id)
);

create index if not exists stage_completions_pursuit_idx
  on public.stage_completions (pursuit_id, completed_at desc);
create index if not exists stage_completions_user_idx
  on public.stage_completions (user_id, pursuit_id);

-- The old model: a slider from 0 to 100 that everybody set once and forgot.
alter table public.memberships drop column if exists progress;
drop table if exists public.progress_updates cascade;

-- Progress is now counted, not claimed.
create or replace function public.member_progress(p_pursuit uuid, p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select count(*) from public.stages where pursuit_id = p_pursuit) = 0 then 0
    else (
      (select count(*) from public.stage_completions
        where pursuit_id = p_pursuit and user_id = p_user) * 100
      / (select count(*) from public.stages where pursuit_id = p_pursuit)
    )::integer
  end;
$$;

create or replace function public.collective_progress(p_pursuit uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select round(avg(public.member_progress(p_pursuit, m.user_id)))::integer
    from public.memberships m where m.pursuit_id = p_pursuit
  ), 0);
$$;

-- ---------------------------------------------------------------------------
-- Badges
-- ---------------------------------------------------------------------------

create table if not exists public.badges (
  slug        text primary key,
  name        text not null,
  description text not null default '',
  emoji       text not null default '🏅'
);

insert into public.badges (slug, name, description, emoji) values
  ('stage',        'Stage cleared',   'Finished a stage and wrote down how.',        '🪜'),
  ('first-steps',  'First steps',     'Finished your first stage anywhere.',          '🌱'),
  ('finisher',     'Finisher',        'Finished every stage of a pursuit.',           '🏁'),
  ('contributor',  'Contributor',     'Added something to a pursuit''s knowledge base.', '📚'),
  ('helper',       'Helper',          'Answered somebody who asked for help.',        '🤝'),
  ('quizmaster',   'Quizmaster',      'Wrote a quiz other people took.',              '🧠'),
  ('toolmaker',    'Toolmaker',       'Built a tool other people used.',              '🛠️')
on conflict (slug) do nothing;

create table if not exists public.user_badges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  badge_slug text not null references public.badges on delete cascade,
  pursuit_id uuid references public.pursuits on delete cascade,
  stage_id   uuid references public.stages on delete cascade,
  label      text not null default '',
  earned_at  timestamptz not null default now()
);

-- One of each badge per scope. A stage badge is scoped to its stage, a pursuit
-- badge to its pursuit, and a lifetime badge to neither.
create unique index if not exists user_badges_once on public.user_badges (
  user_id, badge_slug,
  coalesce(stage_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(pursuit_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
create index if not exists user_badges_user_idx on public.user_badges (user_id, earned_at desc);

-- ---------------------------------------------------------------------------
-- Quizzes
-- ---------------------------------------------------------------------------

create table if not exists public.quizzes (
  id            uuid primary key default gen_random_uuid(),
  pursuit_id    uuid not null references public.pursuits on delete cascade,
  user_id       uuid not null references public.profiles on delete cascade,
  stage_id      uuid references public.stages on delete set null,
  title         text not null,
  description   text not null default '',
  attempt_count integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists quizzes_pursuit_idx on public.quizzes (pursuit_id, created_at desc);

create table if not exists public.quiz_questions (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes on delete cascade,
  position      integer not null,
  prompt        text not null,
  options       text[] not null,
  correct_index integer not null,
  explanation   text not null default '',
  unique (quiz_id, position)
);

create table if not exists public.quiz_attempts (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references public.quizzes on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  score      integer not null,
  total      integer not null,
  created_at timestamptz not null default now(),
  unique (quiz_id, user_id)
);

drop trigger if exists quiz_attempts_count on public.quiz_attempts;
create trigger quiz_attempts_count after insert or delete on public.quiz_attempts
  for each row execute function public.bump_counter('quiz_attempts');

-- ---------------------------------------------------------------------------
-- Tools — checklists and calculators, built from safe parts
-- ---------------------------------------------------------------------------

create table if not exists public.tools (
  id          uuid primary key default gen_random_uuid(),
  pursuit_id  uuid not null references public.pursuits on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  stage_id    uuid references public.stages on delete set null,
  kind        text not null check (kind in ('checklist', 'calculator')),
  title       text not null,
  description text not null default '',
  -- checklist:  { "items": ["...", "..."] }
  -- calculator: { "inputs": [{ "key": "savings", "label": "Savings" }],
  --               "formula": "savings / burn", "unit": "months" }
  config      jsonb not null default '{}'::jsonb,
  use_count   integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists tools_pursuit_idx on public.tools (pursuit_id, created_at desc);

create table if not exists public.tool_uses (
  tool_id    uuid not null references public.tools on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tool_id, user_id)
);

drop trigger if exists tool_uses_count on public.tool_uses;
create trigger tool_uses_count after insert or delete on public.tool_uses
  for each row execute function public.bump_counter('tool_uses');

-- ---------------------------------------------------------------------------
-- Counters for the new tables
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
  elsif tg_argv[0] = 'reply_useful' then
    target := coalesce(new.reply_id, old.reply_id);
    update public.replies set useful_count = greatest(0, useful_count + delta) where id = target;
  elsif tg_argv[0] = 'resource_votes' then
    target := coalesce(new.resource_id, old.resource_id);
    update public.resources set vote_count = greatest(0, vote_count + delta) where id = target;
  elsif tg_argv[0] = 'event_rsvps' then
    target := coalesce(new.event_id, old.event_id);
    update public.events set rsvp_count = greatest(0, rsvp_count + delta) where id = target;
  elsif tg_argv[0] = 'quiz_attempts' then
    target := coalesce(new.quiz_id, old.quiz_id);
    update public.quizzes set attempt_count = greatest(0, attempt_count + delta) where id = target;
  elsif tg_argv[0] = 'tool_uses' then
    target := coalesce(new.tool_id, old.tool_id);
    update public.tools set use_count = greatest(0, use_count + delta) where id = target;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security for everything added above
-- ---------------------------------------------------------------------------

alter table public.point_events      enable row level security;
alter table public.reply_useful      enable row level security;
alter table public.stage_completions enable row level security;
alter table public.badges            enable row level security;
alter table public.user_badges       enable row level security;
alter table public.quizzes           enable row level security;
alter table public.quiz_questions    enable row level security;
alter table public.quiz_attempts     enable row level security;
alter table public.tools             enable row level security;
alter table public.tool_uses         enable row level security;

-- Your ledger is yours to read. Other people see the total on your profile,
-- never the itemised history of who thought what of you.
drop policy if exists "own point history" on public.point_events;
create policy "own point history" on public.point_events
  for select to authenticated using (user_id = auth.uid());

-- Points are awarded by the person doing the appreciating, so the insert is
-- theirs; the row is pinned to them as actor so it cannot be forged for someone
-- else, and self-awarded points are limited to your own progress.
drop policy if exists "award points" on public.point_events;
create policy "award points" on public.point_events
  for insert to authenticated
  with check (
    points = public.points_for(kind)
    and (
      (actor_id = auth.uid() and user_id <> auth.uid())
      or (user_id = auth.uid() and kind in ('stage_completed', 'connection_made'))
    )
  );

drop policy if exists "withdraw points" on public.point_events;
create policy "withdraw points" on public.point_events
  for delete to authenticated using (actor_id = auth.uid());

drop policy if exists "reply useful readable" on public.reply_useful;
create policy "reply useful readable" on public.reply_useful
  for select to authenticated using (true);
drop policy if exists "reply useful toggle" on public.reply_useful;
create policy "reply useful toggle" on public.reply_useful
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "completions readable" on public.stage_completions;
create policy "completions readable" on public.stage_completions
  for select to authenticated using (true);
drop policy if exists "complete your own stage" on public.stage_completions;
create policy "complete your own stage" on public.stage_completions
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(pursuit_id));

drop policy if exists "badges readable" on public.badges;
create policy "badges readable" on public.badges for select to authenticated using (true);

drop policy if exists "user badges readable" on public.user_badges;
create policy "user badges readable" on public.user_badges
  for select to authenticated using (true);
drop policy if exists "earn your own badge" on public.user_badges;
create policy "earn your own badge" on public.user_badges
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "quizzes readable" on public.quizzes;
create policy "quizzes readable" on public.quizzes for select to authenticated using (true);
drop policy if exists "quizzes create" on public.quizzes;
create policy "quizzes create" on public.quizzes
  for insert to authenticated with check (user_id = auth.uid() and public.is_member(pursuit_id));
drop policy if exists "quizzes edit own" on public.quizzes;
create policy "quizzes edit own" on public.quizzes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "quizzes delete own" on public.quizzes;
create policy "quizzes delete own" on public.quizzes
  for delete to authenticated using (user_id = auth.uid() or public.is_steward(pursuit_id));

-- Questions are readable because taking a quiz needs them. The right answer
-- travels with them, which is a deliberate trade: this is a community teaching
-- itself, not an exam hall.
drop policy if exists "quiz questions readable" on public.quiz_questions;
create policy "quiz questions readable" on public.quiz_questions
  for select to authenticated using (true);
drop policy if exists "quiz questions write" on public.quiz_questions;
create policy "quiz questions write" on public.quiz_questions
  for all to authenticated
  using (exists (select 1 from public.quizzes q where q.id = quiz_id and q.user_id = auth.uid()))
  with check (exists (select 1 from public.quizzes q where q.id = quiz_id and q.user_id = auth.uid()));

drop policy if exists "attempts readable" on public.quiz_attempts;
create policy "attempts readable" on public.quiz_attempts
  for select to authenticated using (true);
drop policy if exists "record own attempt" on public.quiz_attempts;
create policy "record own attempt" on public.quiz_attempts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "tools readable" on public.tools;
create policy "tools readable" on public.tools for select to authenticated using (true);
drop policy if exists "tools create" on public.tools;
create policy "tools create" on public.tools
  for insert to authenticated with check (user_id = auth.uid() and public.is_member(pursuit_id));
drop policy if exists "tools edit own" on public.tools;
create policy "tools edit own" on public.tools
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "tools delete own" on public.tools;
create policy "tools delete own" on public.tools
  for delete to authenticated using (user_id = auth.uid() or public.is_steward(pursuit_id));

drop policy if exists "tool uses readable" on public.tool_uses;
create policy "tool uses readable" on public.tool_uses
  for select to authenticated using (true);
drop policy if exists "record tool use" on public.tool_uses;
create policy "record tool use" on public.tool_uses
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Adding to the knowledge base now needs standing in the pursuit.
drop policy if exists "resources create" on public.resources;
create policy "resources create" on public.resources
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_member(pursuit_id)
    and public.can_add_resources(pursuit_id)
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.points_for(text) to authenticated;
grant execute on function public.can_add_resources(uuid) to authenticated;
grant execute on function public.member_progress(uuid, uuid) to anon, authenticated;
grant execute on function public.collective_progress(uuid) to anon, authenticated;
