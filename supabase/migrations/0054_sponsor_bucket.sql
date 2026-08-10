-- Somewhere to put a sponsor's logo and their reward still.
--
-- **This is a separate migration from 0053 on purpose, and the reason is the
-- worst hour of this feature's life.**
--
-- The bucket started out at the bottom of 0053, under the columns. `supabase db
-- push` runs each migration file in one transaction, so a failure anywhere in
-- that file rolls back everything in it — including the six `sponsor_` columns.
-- And this is the one statement in the whole feature that can fail for reasons
-- that have nothing to do with the SQL being right: writing to `storage.buckets`
-- depends on the role the migration runs as, and that varies between a hosted
-- project, a local stack and a self-hosted one.
--
-- The consequence was severe out of all proportion to the cause. Every read of
-- a box selects the `sponsor_` columns, so a rolled-back 0053 means every one
-- of those selects fails — and the lobby swallows the error and renders an
-- empty board. A storage permission problem presented as *every box on the
-- platform disappearing*.
--
-- Split, the failure modes stop being connected. 0053 is columns and
-- constraints, which cannot fail on a database that has a `boxes` table. This
-- is storage, and the worst it can now cost is that uploads don't work.

-- ---------------------------------------------------------------------------
-- Public on read, service-role on write
-- ---------------------------------------------------------------------------
--
-- Public because these are logos and product shots on a public landing page:
-- signing them would mean minting a URL per render, expiring it, and having a
-- front page whose images go stale in an admin's open tab. There is nothing
-- private in this bucket by construction — an admin uploads to it precisely so
-- that strangers see the contents.
--
-- Writes are the other half, and the answer is the one used everywhere else
-- here: no RLS policy is created on `storage.objects` for this bucket, so
-- `anon` and `authenticated` can neither upload nor delete. The only key that
-- can write is the service role, which lives on the server behind
-- `getAdminUser()`. Readable by everyone and writable by nobody-but-us is
-- exactly the shape of this feature. **Do not add policies here.**

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'sponsors',
    'sponsors',
    true,
    -- 25 MB. A logo is kilobytes; the ceiling is here for the video, and it is
    -- deliberately low enough that nobody uploads a two-minute advert to a page
    -- somebody is trying to play a game on. The upload route caps images at 3MB
    -- separately, because the bucket's single limit has to be the video's.
    26214400,
    --
    -- No SVG, deliberately. An SVG is a document that may carry script, and
    -- serving one back from our own origin — which is what a public bucket does
    -- — is a stored cross-site scripting hole dressed as a logo. Next's image
    -- optimiser refuses them for the same reason unless `dangerouslyAllowSVG`
    -- is turned on, and the name of that flag is the argument. Every business
    -- has a PNG.
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

exception
  /*
   * A bucket this migration could not create is a bucket somebody can make in
   * the dashboard in thirty seconds, and it must not take the push down with
   * it — everything else in this feature is already applied by the time this
   * runs, and a failed push would leave an admin unsure what landed.
   *
   * So the two failures that are about the environment rather than the SQL are
   * caught and reported. Anything else still raises, because a genuine mistake
   * in the statement above should be loud.
   */
  when insufficient_privilege or undefined_table then
    -- `using message =` takes a string, not a format: a `%` in here is printed
    -- as a percent sign rather than filled in. The reason goes in `detail`.
    raise warning using
      message = 'sponsors bucket not created',
      detail  = sqlerrm,
      hint    = 'Create a public bucket named "sponsors" in Dashboard > Storage '
                '(25MB limit; png, jpeg, webp, gif, mp4, webm) and add no RLS '
                'policies. Everything else in 0053/0054 has applied; only '
                'sponsor uploads are affected.';
end $$;
