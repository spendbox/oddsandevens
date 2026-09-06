-- Counting uses without letting anybody edit somebody else's tool.
--
-- A tool's run count has to go up when a stranger uses it, but strangers must
-- not be able to update the tools table. Security definer functions are the
-- narrow opening: they can do exactly this one thing and nothing else.

create or replace function public.bump_run_count(p_tool uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tools set run_count = run_count + 1
  where id = p_tool and status = 'published';
$$;

create or replace function public.bump_view_count(p_tool uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tools set view_count = view_count + 1
  where id = p_tool and status = 'published';
$$;

grant execute on function public.bump_run_count(uuid) to anon, authenticated;
grant execute on function public.bump_view_count(uuid) to anon, authenticated;
