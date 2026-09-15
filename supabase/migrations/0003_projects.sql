-- Projects, which group documents.
--
-- Membership lives on the document (`docs.project_id`), not as a list on the
-- project. One home for the fact, so moving a document is one field on one row
-- and there is no second list that can disagree about where it lives — which
-- is exactly how two devices end up showing different contents for the same
-- project.

create table if not exists public.projects (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  collapsed boolean not null default false,
  created_at bigint not null,
  updated_at bigint not null,
  -- A tombstone, like a document's, so a delete reaches the other device
  -- instead of the other device helpfully re-uploading the project.
  deleted_at bigint
);

create index if not exists projects_user_updated_idx
  on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

-- Four policies rather than one "for all": a single policy would let a client
-- move a row to another user_id on update, which is a way to write into
-- somebody else's account.
drop policy if exists "read own projects" on public.projects;
create policy "read own projects" on public.projects
  for select using (auth.uid() = user_id);

drop policy if exists "insert own projects" on public.projects;
create policy "insert own projects" on public.projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own projects" on public.projects;
create policy "update own projects" on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own projects" on public.projects;
create policy "delete own projects" on public.projects
  for delete using (auth.uid() = user_id);

-- Documents point at their project.
--
-- Deliberately NOT a foreign key with `on delete cascade`: deleting a project
-- must not delete the documents inside it. It is also not `references` at all,
-- because sync pushes documents and projects independently and a document can
-- legitimately arrive first. A dangling id is handled in the app, where such a
-- document is shown as ungrouped rather than hidden.
alter table public.docs
  add column if not exists project_id uuid;

create index if not exists docs_project_idx
  on public.docs (user_id, project_id);
