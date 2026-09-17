-- What a document keeps about itself: whether it is starred, the rules it
-- applies to its own lines, and what it is trying to do.
--
-- These were on the document from the day each was added, and every one of
-- them was dropped on the way to the server: the row had no column to put them
-- in, so a favourite starred on a laptop was not starred on the phone, and a
-- document's Brain rules stopped at the edge of the device that wrote them.
-- Membership, favourites, rules and goals are all the same kind of fact — one
-- optional field on the document — so they travel the same way.

alter table public.docs
  add column if not exists favorited_at bigint,
  -- jsonb rather than a table of rules: a document is always read and written
  -- whole, so a join per open would buy nothing.
  add column if not exists rules jsonb,
  add column if not exists ignore_rules boolean not null default false,
  add column if not exists goals jsonb;
