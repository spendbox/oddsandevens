-- Row level security, and the profile every sign-up needs.
--
-- The rule that shapes all of this: a published tool is readable by anyone,
-- signed in or not. A tool nobody can open is not a product.

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
    base_handle := 'maker';
  end if;
  base_handle := left(base_handle, 20);
  final_handle := base_handle;

  while exists (select 1 from public.profiles where handle = final_handle) loop
    suffix := suffix + 1;
    final_handle := base_handle || suffix::text;
  end loop;

  insert into public.profiles (id, handle, full_name)
  values (new.id, final_handle, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

-- Attaching a trigger to auth.users needs rights the SQL editor does not have on
-- every Supabase project. If it is refused, say so and carry on: the app creates
-- a missing profile on first sign-in anyway. Letting it abort here would roll
-- back the whole migration and leave the database with no tables at all.
do $$
begin
  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
exception
  when insufficient_privilege or undefined_table then
    raise notice 'Skipped the auth.users profile trigger (%). The app creates profiles on first sign-in, so nothing is broken.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.tools        enable row level security;
alter table public.tool_records enable row level security;
alter table public.tool_entries enable row level security;
alter table public.tool_runs    enable row level security;
alter table public.purchases    enable row level security;

-- Profiles are public: a tool page shows who made it.
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles
  for select to anon, authenticated using (true);
drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- A published tool is readable by the world. A draft belongs to its maker.
drop policy if exists "published tools are public" on public.tools;
create policy "published tools are public" on public.tools
  for select to anon, authenticated using (status = 'published');
drop policy if exists "own tools readable" on public.tools;
create policy "own tools readable" on public.tools
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "create own tools" on public.tools;
create policy "create own tools" on public.tools
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "edit own tools" on public.tools;
create policy "edit own tools" on public.tools
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "delete own tools" on public.tools;
create policy "delete own tools" on public.tools
  for delete to authenticated using (owner_id = auth.uid());

-- Directory rows follow their tool: public once it is, and paid ones need
-- access. Curating them is the owner's job alone.
drop policy if exists "records follow the tool" on public.tool_records;
create policy "records follow the tool" on public.tool_records
  for select to anon, authenticated
  using (exists (
    select 1 from public.tools t
    where t.id = tool_id and (t.status = 'published' or t.owner_id = auth.uid())
  ));
drop policy if exists "owner curates records" on public.tool_records;
create policy "owner curates records" on public.tool_records
  for all to authenticated
  using (exists (select 1 from public.tools t where t.id = tool_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from public.tools t where t.id = tool_id and t.owner_id = auth.uid()));

-- What somebody tracks is theirs. Not even the tool's maker can read it.
drop policy if exists "own entries" on public.tool_entries;
create policy "own entries" on public.tool_entries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A run is visible to whoever made it and to the tool's owner, who needs to
-- know how their tool is being used.
drop policy if exists "runs visible to you and the maker" on public.tool_runs;
create policy "runs visible to you and the maker" on public.tool_runs
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.tools t where t.id = tool_id and t.owner_id = auth.uid())
  );
-- Anyone may use a published tool they have access to, signed in or not.
drop policy if exists "record a run" on public.tool_runs;
create policy "record a run" on public.tool_runs
  for insert to anon, authenticated
  with check (
    exists (select 1 from public.tools t where t.id = tool_id and t.status = 'published')
    and (user_id is null or user_id = auth.uid())
  );

drop policy if exists "own purchases" on public.purchases;
create policy "own purchases" on public.purchases
  for select to authenticated
  using (
    buyer_id = auth.uid()
    or exists (select 1 from public.tools t where t.id = tool_id and t.owner_id = auth.uid())
  );
drop policy if exists "start a purchase" on public.purchases;
create policy "start a purchase" on public.purchases
  for insert to authenticated with check (buyer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants. Supabase sets these by default; stating them makes the schema
-- portable and the intent readable.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select on table public.profiles, public.tools, public.tool_records to anon;
grant insert on table public.tool_runs to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.has_access(uuid) to anon, authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
