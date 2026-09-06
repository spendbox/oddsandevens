-- Forge: a platform for making digital tools.
--
-- Somebody describes the tool they want, Claude builds it, they edit it, and
-- they publish it at a link. The link works for anyone — signed in or not —
-- because distribution is the whole point.
--
-- The shape of every tool lives in one jsonb column, `spec`, validated in the
-- application against the schema its engine defines. That is deliberate: adding
-- a new kind of tool means adding an engine, not migrating the database.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  handle       text unique not null,
  full_name    text not null default '',
  bio          text not null default '',
  avatar_url   text,
  -- Where a creator's earnings go. Paystack splits to this automatically when
  -- somebody pays for one of their tools.
  paystack_subaccount text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tools
-- ---------------------------------------------------------------------------

create table if not exists public.tools (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles on delete cascade,
  slug        text unique not null,

  -- Which engine runs this tool. The six the platform launches with.
  engine      text not null check (engine in
                ('calculator', 'quiz', 'generator', 'tracker', 'directory', 'assistant')),

  title       text not null,
  tagline     text not null default '',
  description text not null default '',
  emoji       text not null default '🛠️',
  accent      text not null default 'indigo',

  -- The tool itself: inputs, formulas, questions, fields, instructions.
  -- Shaped by the engine; parsed before use, never trusted raw.
  spec        jsonb not null default '{}'::jsonb,

  -- What the creator originally asked for. Kept so a tool can be rebuilt or
  -- improved later without the person having to remember how they phrased it.
  brief       text not null default '',

  status      text not null default 'draft' check (status in ('draft', 'published')),

  -- Price in the smallest unit — kobo for naira. Zero means free.
  price_kobo  integer not null default 0 check (price_kobo >= 0),
  currency    text not null default 'NGN',

  view_count  integer not null default 0,
  run_count   integer not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tools_owner_idx on public.tools (owner_id, updated_at desc);
create index if not exists tools_published_idx on public.tools (status, run_count desc);
create index if not exists tools_engine_idx on public.tools (engine);

create or replace function public.touch_tool()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tools_touch on public.tools;
create trigger tools_touch before update on public.tools
  for each row execute function public.touch_tool();

-- ---------------------------------------------------------------------------
-- Rows a creator curates — the directory engine
-- ---------------------------------------------------------------------------

create table if not exists public.tool_records (
  id         uuid primary key default gen_random_uuid(),
  tool_id    uuid not null references public.tools on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists tool_records_tool_idx on public.tool_records (tool_id, position);

-- ---------------------------------------------------------------------------
-- Rows an end user keeps — the tracker engine
-- ---------------------------------------------------------------------------

create table if not exists public.tool_entries (
  id         uuid primary key default gen_random_uuid(),
  tool_id    uuid not null references public.tools on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  entry_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists tool_entries_idx on public.tool_entries (tool_id, user_id, entry_date desc);

-- ---------------------------------------------------------------------------
-- One use of a tool — a calculation, a quiz result, a generated document
-- ---------------------------------------------------------------------------

create table if not exists public.tool_runs (
  id         uuid primary key default gen_random_uuid(),
  tool_id    uuid not null references public.tools on delete cascade,
  user_id    uuid references public.profiles on delete set null,
  input      jsonb not null default '{}'::jsonb,
  output     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tool_runs_tool_idx on public.tool_runs (tool_id, created_at desc);
create index if not exists tool_runs_user_idx on public.tool_runs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Paying for a tool
-- ---------------------------------------------------------------------------

create table if not exists public.purchases (
  id          uuid primary key default gen_random_uuid(),
  tool_id     uuid not null references public.tools on delete cascade,
  buyer_id    uuid not null references public.profiles on delete cascade,
  reference   text unique not null,
  amount_kobo integer not null,
  currency    text not null default 'NGN',
  status      text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);

create index if not exists purchases_buyer_idx on public.purchases (buyer_id, tool_id);
create unique index if not exists purchases_one_paid
  on public.purchases (tool_id, buyer_id) where status = 'paid';

-- Has this person paid for this tool? Security definer so the check does not
-- depend on the caller being able to read the purchases table.
create or replace function public.has_access(p_tool uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    -- Free tools are open to everyone.
    coalesce((select price_kobo from public.tools where id = p_tool), 0) = 0
    -- So is your own tool.
    or exists (select 1 from public.tools where id = p_tool and owner_id = auth.uid())
    -- Otherwise you have to have paid for it.
    or exists (
      select 1 from public.purchases
      where tool_id = p_tool and buyer_id = auth.uid() and status = 'paid'
    );
$$;
