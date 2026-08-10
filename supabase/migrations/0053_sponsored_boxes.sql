-- A box with a business behind it.
--
-- Every reward on this platform has so far been money, and money is the one
-- thing the schema already knew how to describe: a number in kobo, paid out of
-- an account we control. A sponsor is the other kind of reward — a business
-- puts their name on one of our safes and hands the winner something that is
-- not a transfer. A year of something. A device. A seat at a thing.
--
-- The player gets **both**. Our money is still our money and still lands within
-- 24 hours; the sponsor's reward sits on top of it. That is the whole feature,
-- and everything below exists to make it true and to make it legible on every
-- surface a box appears on.
--
-- Three decisions are built into the shape of this.
--
--   **Ours only.** `sponsor_name` is refused on a contributor's box. A
--   contributor's reward is their funding minus our cut and nothing else —
--   that rule is enforced in `raise_reward` and in the admin route, and a
--   sponsorship is a commercial arrangement between us and a business that
--   nobody else can be signed up to. An admin who wants a sponsored box builds
--   one of ours.
--
--   **The prize hangs off the sponsor, not the box.** There is no such thing
--   here as a reward from a business that isn't named: a winner has to know
--   who is sending them a thing, and a card that says "plus a mystery gift"
--   is worth less than saying nothing. So a prize title without a sponsor name
--   is rejected by a constraint rather than by a route that might be bypassed.
--
--   **A sponsor without a prize is legal.** A business that wants its name and
--   logo on a safe and is funding the money behind it is a real arrangement,
--   and it is the cheap one to sell. The nesting is one-way: sponsor, then
--   optionally a prize; prize, then optionally a picture of it.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------

alter table public.boxes
  /*
   * Who is behind it. This column is the switch for the entire feature: null
   * means an ordinary box and every surface skips every sponsor element.
   */
  add column if not exists sponsor_name text
    check (sponsor_name is null or char_length(sponsor_name) between 1 and 40),

  /*
   * Their logo, in the `sponsors` bucket below.
   *
   * Optional, and the components are built to look right without it — a
   * business with no usable square mark still gets its name set properly
   * rather than a broken image frame. Stored as a full URL rather than an
   * object path because that is what every reader wants and the bucket is
   * public anyway; nothing here ever signs one.
   */
  add column if not exists sponsor_logo_url text
    check (sponsor_logo_url is null or char_length(sponsor_logo_url) <= 500),

  -- What the winner gets from them, in the fewest words that survive a card.
  add column if not exists sponsor_prize_title text
    check (sponsor_prize_title is null or char_length(sponsor_prize_title) between 1 and 60),

  /*
   * And what it actually is.
   *
   * 240 to match `boxes.blurb`, for the same reason: this is read on a phone,
   * under a picture, next to a figure in gold. Anything longer is a page, and
   * a page is not what somebody deciding whether to spend a fortnight of lives
   * on a safe is going to read.
   */
  add column if not exists sponsor_prize_blurb text
    check (sponsor_prize_blurb is null or char_length(sponsor_prize_blurb) <= 240),

  -- A picture of the thing, or a film of it. Same bucket as the logo.
  add column if not exists sponsor_prize_media_url text
    check (sponsor_prize_media_url is null or char_length(sponsor_prize_media_url) <= 500),

  /*
   * Which of the two it is.
   *
   * Kept as a column rather than sniffed from the file extension at render
   * time. A URL is a string somebody typed or a bucket generated, and deciding
   * between an `<img>` and a `<video>` by looking for ".mp4" in it is the kind
   * of guess that renders a black rectangle on the one box that matters. The
   * upload route knows the content type for certain, so it records it.
   */
  add column if not exists sponsor_prize_media_kind text
    check (sponsor_prize_media_kind is null or sponsor_prize_media_kind in ('image', 'video'));

-- ---------------------------------------------------------------------------
-- 2. The rules, as constraints
-- ---------------------------------------------------------------------------
--
-- All four are things the admin route also checks. They are here as well
-- because a route is one caller: these are properties of a sponsored box, and
-- a half-written one — a prize from nobody, a video with no way to tell it is a
-- video — renders as something broken on the front page rather than failing
-- somewhere an admin would see it.

alter table public.boxes
  drop constraint if exists boxes_sponsor_is_ours,
  drop constraint if exists boxes_sponsor_prize_needs_sponsor,
  drop constraint if exists boxes_sponsor_prize_parts,
  drop constraint if exists boxes_sponsor_media_is_whole;

alter table public.boxes
  -- A contributor's box is funded by a contributor. Nobody else's name goes on
  -- it, and no reward attaches to it that we would owe.
  add constraint boxes_sponsor_is_ours check (
    sponsor_name is null or kind = 'general'
  ),

  -- A description and a photograph belong to a prize. Without a title there is
  -- no prize for them to belong to, and a box carrying a film of something
  -- nobody is being given is the state this forbids.
  add constraint boxes_sponsor_prize_parts check (
    sponsor_prize_title is not null or (
      sponsor_prize_blurb is null
      and sponsor_prize_media_url is null
      and sponsor_prize_media_kind is null
    )
  ),

  -- No anonymous rewards.
  add constraint boxes_sponsor_prize_needs_sponsor check (
    sponsor_prize_title is null or sponsor_name is not null
  ),

  -- A URL with no kind is a file nothing knows how to draw; a kind with no URL
  -- is a promise of a picture that never arrives. Neither travels alone.
  add constraint boxes_sponsor_media_is_whole check (
    (sponsor_prize_media_url is null) = (sponsor_prize_media_kind is null)
  );

-- The lobby reads live boxes constantly and a sponsored one is rare, so the
-- index is partial: it is a list of the sponsored boxes rather than a tree over
-- every box that isn't.
create index if not exists boxes_sponsored_idx
  on public.boxes (sponsor_name)
  where sponsor_name is not null;

-- ---------------------------------------------------------------------------
-- 3. Somewhere to put the files
-- ---------------------------------------------------------------------------
--
-- Public on read, service-role on write.
--
-- Public because these are logos and product shots on a public landing page:
-- signing them would mean minting a URL per render, expiring it, and having a
-- front page whose images go stale in an admin's browser tab. There is nothing
-- private in this bucket by construction — an admin uploads to it precisely so
-- that strangers see the contents.
--
-- Writes are a different question, and the answer is the one used everywhere
-- else here: no RLS policy is created on `storage.objects` for this bucket, so
-- `anon` and `authenticated` can neither upload nor delete. The only key that
-- can write is the service role, which lives on the server behind
-- `getAdminUser()`. A bucket that is readable by everyone and writable by
-- nobody-but-us is exactly the shape of this feature.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sponsors',
  'sponsors',
  true,
  -- 25 MB. A logo is kilobytes; the ceiling is here for the video, and it is
  -- deliberately low enough that nobody uploads a two-minute advert to a page
  -- somebody is trying to play a game on. The route caps images far lower.
  26214400,
  --
  -- No SVG, deliberately. An SVG is a document that may carry script, and
  -- serving one back from our own origin — which is what a public bucket does
  -- — is a stored cross-site scripting hole dressed as a logo. Next's image
  -- optimiser refuses them for the same reason unless `dangerouslyAllowSVG` is
  -- turned on, and the name of that flag is the argument. Every business has a
  -- PNG.
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Tell PostgREST
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
