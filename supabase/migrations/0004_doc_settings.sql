-- Whether a document is starred.
--
-- It was on the document from the day favourites were added, and it was
-- dropped on the way to the server: the row had no column to put it in, so a
-- favourite starred on a laptop was not starred on the phone. Membership and
-- favourites are the same kind of fact — one optional field on the document —
-- so they travel the same way.

alter table public.docs
  add column if not exists favorited_at bigint;
