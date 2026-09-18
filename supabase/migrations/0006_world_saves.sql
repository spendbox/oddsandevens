-- How many people have kept a copy of a shared note.
--
-- The one number a person who shares something actually wants, and the only
-- one this app keeps: not views, not likes, not followers. A save is somebody
-- deciding the note was worth having — which is the whole of what the World
-- is for — and it is a single integer on the row rather than a table of who
-- did it, because who saved your note is nobody's business including yours.

alter table public.shared_docs
  add column if not exists saves integer not null default 0;

-- One more save on one listed note.
--
-- Security definer because the reader doing the saving does not own the row
-- and must not be able to write to it in any other way. This can only add one
-- to one counter on a note that is already public, and it returns nothing.
--
-- The honest limit: nothing stops somebody calling it repeatedly to inflate
-- their own count. That is the same trade every public counter makes, and the
-- number is decoration on somebody's own dashboard rather than a ranking that
-- decides what other people see — the World is ordered by date, deliberately.
create or replace function public.world_saved(share_id uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.shared_docs
  set saves = saves + 1
  where id = share_id and listed;
$$;

grant execute on function public.world_saved(uuid) to anon, authenticated;
