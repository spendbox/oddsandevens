-- Commons: an intent network.
--
-- The core object is a Pursuit: an outcome a group of people are all trying to
-- reach. A pursuit is deliberately not a chat room. It is six surfaces around
-- one outcome — discussion, progress, people, needs/offers, resources, events —
-- and the schema below is shaped so each of those is first class.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  handle       text unique not null,
  full_name    text not null default '',
  headline     text not null default '',
  bio          text not null default '',
  location     text not null default '',
  avatar_url   text,
  skills       text[] not null default '{}',
  interests    text[] not null default '{}',
  onboarded    boolean not null default false,
  created_at   timestamptz not null default now()
);

create index profiles_skills_idx on public.profiles using gin (skills);
create index profiles_handle_idx on public.profiles (handle);

-- ---------------------------------------------------------------------------
-- Pursuits
-- ---------------------------------------------------------------------------

create table public.pursuits (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  title        text not null,
  tagline      text not null default '',
  description  text not null default '',
  category     text not null default 'other',
  emoji        text not null default '🎯',
  accent       text not null default 'violet',
  tags         text[] not null default '{}',
  is_private   boolean not null default false,
  created_by   uuid references public.profiles on delete set null,
  member_count integer not null default 0,
  created_at   timestamptz not null default now()
);

create index pursuits_category_idx on public.pursuits (category);
create index pursuits_tags_idx on public.pursuits using gin (tags);

-- Full text search over title/tagline/tags, so "build a profitable saas
-- company" finds the pursuit even when the wording differs.
--
-- array_to_string is only marked stable, which a generated column will not
-- accept, so the tags are flattened through an immutable wrapper.
create or replace function public.words(p_tags text[])
returns text language sql immutable parallel safe
as $$ select array_to_string(coalesce(p_tags, '{}'), ' ') $$;

alter table public.pursuits add column search tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(tagline, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('english', public.words(tags)), 'B')
  ) stored;

create index pursuits_search_idx on public.pursuits using gin (search);

-- The journey everyone in a pursuit is walking. Ordered, named by the pursuit
-- itself, so "Build a SaaS" can have IDEA→VALIDATING→BUILDING→BETA→LAUNCHED
-- while "Run a marathon" has something else entirely.
create table public.stages (
  id          uuid primary key default gen_random_uuid(),
  pursuit_id  uuid not null references public.pursuits on delete cascade,
  name        text not null,
  description text not null default '',
  position    integer not null,
  unique (pursuit_id, position)
);

create index stages_pursuit_idx on public.stages (pursuit_id, position);

create table public.memberships (
  id           uuid primary key default gen_random_uuid(),
  pursuit_id   uuid not null references public.pursuits on delete cascade,
  user_id      uuid not null references public.profiles on delete cascade,
  stage_id     uuid references public.stages on delete set null,
  progress     integer not null default 0 check (progress between 0 and 100),
  intent       text not null default '',
  role         text not null default 'member' check (role in ('member', 'steward')),
  joined_at    timestamptz not null default now(),
  unique (pursuit_id, user_id)
);

create index memberships_pursuit_idx on public.memberships (pursuit_id);
create index memberships_user_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------------
-- 2. DISCUSS — structured, not a feed
-- ---------------------------------------------------------------------------

create table public.posts (
  id           uuid primary key default gen_random_uuid(),
  pursuit_id   uuid not null references public.pursuits on delete cascade,
  author_id    uuid not null references public.profiles on delete cascade,
  kind         text not null default 'update'
                 check (kind in ('question', 'update', 'insight', 'win')),
  title        text not null default '',
  body         text not null,
  stage_id     uuid references public.stages on delete set null,
  reply_count  integer not null default 0,
  useful_count integer not null default 0,
  created_at   timestamptz not null default now()
);

create index posts_pursuit_idx on public.posts (pursuit_id, created_at desc);
create index posts_author_idx on public.posts (author_id);

create table public.replies (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts on delete cascade,
  author_id  uuid not null references public.profiles on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create index replies_post_idx on public.replies (post_id, created_at);

-- "This was useful" rather than "like". The distinction matters: it is the
-- signal the knowledge base is built from.
create table public.post_useful (
  post_id uuid not null references public.posts on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  primary key (post_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 3. PROGRESS — where everyone actually is
-- ---------------------------------------------------------------------------

create table public.progress_updates (
  id          uuid primary key default gen_random_uuid(),
  pursuit_id  uuid not null references public.pursuits on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  stage_id    uuid references public.stages on delete set null,
  from_progress integer,
  to_progress   integer not null,
  note        text not null default '',
  is_milestone boolean not null default false,
  created_at  timestamptz not null default now()
);

create index progress_updates_pursuit_idx on public.progress_updates (pursuit_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. HELP — the marketplace of needs and capabilities
-- ---------------------------------------------------------------------------

create table public.asks (
  id          uuid primary key default gen_random_uuid(),
  pursuit_id  uuid not null references public.pursuits on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  kind        text not null check (kind in ('need', 'offer')),
  title       text not null,
  body        text not null default '',
  tags        text[] not null default '{}',
  status      text not null default 'open' check (status in ('open', 'matched', 'closed')),
  created_at  timestamptz not null default now()
);

create index asks_pursuit_idx on public.asks (pursuit_id, kind, status, created_at desc);
create index asks_tags_idx on public.asks using gin (tags);

create table public.ask_responses (
  id         uuid primary key default gen_random_uuid(),
  ask_id     uuid not null references public.asks on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  unique (ask_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 5. LEARN — collective knowledge, so 8,000 people stop asking the same thing
-- ---------------------------------------------------------------------------

create table public.resources (
  id           uuid primary key default gen_random_uuid(),
  pursuit_id   uuid not null references public.pursuits on delete cascade,
  user_id      uuid references public.profiles on delete set null,
  kind         text not null default 'link'
                 check (kind in ('book', 'tool', 'template', 'course', 'link', 'experience')),
  title        text not null,
  url          text,
  description  text not null default '',
  stage_id     uuid references public.stages on delete set null,
  vote_count   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index resources_pursuit_idx on public.resources (pursuit_id, vote_count desc);

create table public.resource_votes (
  resource_id uuid not null references public.resources on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  primary key (resource_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 6. DO — challenges, meetups, sessions
-- ---------------------------------------------------------------------------

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  pursuit_id   uuid not null references public.pursuits on delete cascade,
  created_by   uuid references public.profiles on delete set null,
  kind         text not null default 'meetup'
                 check (kind in ('meetup', 'workshop', 'challenge', 'ama', 'session')),
  title        text not null,
  description  text not null default '',
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  location     text not null default '',
  is_virtual   boolean not null default true,
  url          text,
  rsvp_count   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index events_pursuit_idx on public.events (pursuit_id, starts_at);

create table public.event_rsvps (
  event_id uuid not null references public.events on delete cascade,
  user_id  uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Connections and messages
-- ---------------------------------------------------------------------------

create table public.connections (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles on delete cascade,
  addressee_id uuid not null references public.profiles on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined')),
  reason       text not null default '',
  pursuit_id   uuid references public.pursuits on delete set null,
  created_at   timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index connections_addressee_idx on public.connections (addressee_id, status);
create index connections_requester_idx on public.connections (requester_id, status);

create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references public.profiles on delete cascade,
  user_b     uuid not null references public.profiles on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  sender_id       uuid not null references public.profiles on delete cascade,
  body            text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  href       text,
  actor_id   uuid references public.profiles on delete set null,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
