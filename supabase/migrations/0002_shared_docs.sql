-- Publicly readable snapshots of a document, for sharing by link.
--
-- A snapshot, not a live view of `docs`. Two reasons, and both matter:
--
--  1. `docs` is protected by "you can only read your own". Sharing must not
--     weaken that policy — one mistake there exposes every private document
--     in the table. A separate table with its own public-read policy cannot
--     leak anything that was not deliberately published into it.
--
--  2. Publishing becomes an explicit act with an explicit moment. Editing a
--     document does not silently change what a link someone was already given
--     shows; the owner decides when to update the shared copy.

create table if not exists public.shared_docs (
  -- The id that appears in the URL. Generated client-side as a v4 uuid, so it
  -- is not guessable by counting.
  id uuid primary key,
  -- Which document this came from, so re-sharing updates rather than piles up.
  doc_id uuid not null,
  owner uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  created_at bigint not null,
  updated_at bigint not null
);

-- One share per document per owner: publishing twice updates the same link
-- rather than leaving the first one live and forgotten.
create unique index if not exists shared_docs_doc_owner_idx
  on public.shared_docs (doc_id, owner);

alter table public.shared_docs enable row level security;

-- Anyone, signed in or not, may read a shared document. That is the whole
-- point of a link. Only rows deliberately inserted here are readable.
drop policy if exists "anyone can read a shared doc" on public.shared_docs;
create policy "anyone can read a shared doc" on public.shared_docs
  for select using (true);

-- Writing is the owner's alone. `with check` on the update is what stops a
-- client moving a row to another owner.
drop policy if exists "owner can publish" on public.shared_docs;
create policy "owner can publish" on public.shared_docs
  for insert with check (auth.uid() = owner);

drop policy if exists "owner can republish" on public.shared_docs;
create policy "owner can republish" on public.shared_docs
  for update using (auth.uid() = owner) with check (auth.uid() = owner);

drop policy if exists "owner can stop sharing" on public.shared_docs;
create policy "owner can stop sharing" on public.shared_docs
  for delete using (auth.uid() = owner);
