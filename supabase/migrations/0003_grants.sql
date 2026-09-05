-- Supabase grants these by default for tables created in the public schema, but
-- stating them explicitly means the schema behaves the same on any Postgres and
-- makes the intent readable: the API roles can reach every table, and row level
-- security decides which rows they actually see.

grant usage on schema public to anon, authenticated;

grant select on table public.pursuits, public.stages to anon;

grant select, insert, update, delete on all tables in schema public to authenticated;

grant execute on function public.stage_counts(uuid) to anon, authenticated;
grant execute on function public.collective_progress(uuid) to anon, authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_steward(uuid) to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
