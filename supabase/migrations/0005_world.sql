-- The World: shared notes anybody can read, and the one flag that decides.
--
-- Sharing already existed as a link: a snapshot in `shared_docs`, at an
-- unguessable address, sent to particular people. That stays exactly as it
-- was. What this adds is a second, deliberate step — `listed` — which is the
-- difference between "here is a link" and "put this where anyone can find
-- it". A link share is not listed unless its owner says so, and nothing that
-- was shared before this migration becomes public by running it: the column
-- defaults to false.
--
-- It also closes a hole that was there from the start. `shared_docs` was
-- readable by anyone for any row, which is fine for a table nobody can
-- enumerate and not fine at all once the anon key is in a browser bundle: a
-- single unfiltered select returned every link-shared note in the table,
-- unguessable address or not. Reading is now limited to what is listed, plus
-- your own rows, and a link is served by `shared_doc()` below — a function
-- that takes the id, which is the same secret the link was.

alter table public.shared_docs
  -- Listed in the World. False is a link share, which is what every existing
  -- row is and what every new one is until somebody says otherwise.
  add column if not exists listed boolean not null default false,
  -- Who to credit. The name the sharer calls themselves in the app, which is
  -- a preference on their device rather than anything the account knows, so
  -- it is copied onto the row at the moment of publishing.
  add column if not exists author text not null default '',
  -- The whole note as plain text, for searching. The blocks are jsonb and
  -- searching inside them means parsing them on every query; this is the same
  -- words in the shape Postgres can index.
  add column if not exists body text not null default '',
  -- The opening of it, for the row in the list. Held separately so browsing
  -- the World never downloads the full text of twenty notes to show two lines
  -- of each.
  add column if not exists preview text not null default '';

-- What search actually runs against. Generated, so it cannot drift from the
-- title and body it describes, and indexed, so a search is an index lookup
-- rather than a scan of every shared note.
--
-- 'simple' rather than 'english': these notes are in whatever language they
-- were written in, and stemming them all as English is worse than not
-- stemming at all.
alter table public.shared_docs
  add column if not exists search tsvector
  generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, ''))
  ) stored;

create index if not exists shared_docs_search_idx
  on public.shared_docs using gin (search);

-- The World's own listing: newest first, and only the listed ones. Partial,
-- because the unlisted rows are never in this query and there is no reason to
-- carry them in the index.
create index if not exists shared_docs_listed_idx
  on public.shared_docs (updated_at desc)
  where listed;

-- Reading, narrowed. Anyone may read what was deliberately listed; an owner
-- may always read their own rows, which is what the note's menu needs to know
-- whether this note is already shared.
drop policy if exists "anyone can read a shared doc" on public.shared_docs;
drop policy if exists "anyone can read a listed doc" on public.shared_docs;
create policy "anyone can read a listed doc" on public.shared_docs
  for select using (listed or auth.uid() = owner);

-- One shared note, by the id in its link.
--
-- Security definer because the policy above no longer lets a stranger select
-- an unlisted row — and a link share is exactly a stranger reading an
-- unlisted row. The id is the secret, as it always was; this function will
-- only ever return the single row whose id you already have, and never
-- enumerate.
create or replace function public.shared_doc(share_id uuid)
returns table (
  title text,
  blocks jsonb,
  updated_at bigint,
  author text,
  listed boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select s.title, s.blocks, s.updated_at, s.author, s.listed
  from public.shared_docs s
  where s.id = share_id;
$$;

grant execute on function public.shared_doc(uuid) to anon, authenticated;

-- How many notes, and how many people.
--
-- A count, not a list: it answers "is anybody else here" in one number, which
-- is the question somebody opening the World for the first time actually has.
-- Definer for the same reason as above — it reads rows to count them and
-- returns nothing else about them.
create or replace function public.world_stats()
returns table (notes bigint, people bigint)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint, count(distinct s.owner)::bigint
  from public.shared_docs s
  where s.listed;
$$;

grant execute on function public.world_stats() to anon, authenticated;

-- Whether a note is read for tasks. See `ignoreTasks` on the note: absent is
-- "read it", which is every note that existed before the question could be
-- asked, so the column is nullable with no default rather than `false`.
alter table public.docs
  add column if not exists ignore_tasks boolean;
