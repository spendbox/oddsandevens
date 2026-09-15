-- Documents, one row each, owned by exactly one signed-in user.
--
-- The blocks are stored as jsonb rather than as their own tables. A document
-- is always read and written whole, never queried by block, so splitting it
-- across tables would buy nothing and cost a join on every open.

create table if not exists public.docs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  created_at bigint not null,
  updated_at bigint not null,
  -- A delete is carried as a tombstone rather than a missing row, so a second
  -- device learns the document is gone instead of helpfully re-uploading it.
  deleted_at bigint
);

create index if not exists docs_user_updated_idx
  on public.docs (user_id, updated_at desc);

alter table public.docs enable row level security;

-- Four policies, not one. A single "for all" policy would let a client move a
-- row to another user_id on update, which is a way to write into someone
-- else's account.
drop policy if exists "read own docs" on public.docs;
create policy "read own docs" on public.docs
  for select using (auth.uid() = user_id);

drop policy if exists "insert own docs" on public.docs;
create policy "insert own docs" on public.docs
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own docs" on public.docs;
create policy "update own docs" on public.docs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own docs" on public.docs;
create policy "delete own docs" on public.docs
  for delete using (auth.uid() = user_id);
