-- Telling the business their box is live, and giving them something to post.
--
-- A sponsorship is a thing somebody bought, and until now the only way they
-- learned it had gone up was to be told by hand. Worse, the most valuable thing
-- we can give a sponsor is not the placement — it is *reach they can use*: a
-- link, and artwork sized for the places their customers actually are. A
-- business that can post a square to Instagram and a portrait to WhatsApp
-- status the same afternoon is a business that renews.
--
-- Two columns, and the second is the one that keeps this from becoming a
-- nuisance.

alter table public.boxes
  /*
   * Where to send it.
   *
   * **Never on `PUBLIC_BOX_COLUMNS`, and this comment is the reason.** Every
   * other `sponsor_` column is on that list precisely so it reaches a browser;
   * this one is a business's contact address, which is nobody's business but
   * ours and theirs. It is read explicitly, by the admin routes that need it,
   * and `toPublicBox` never sees it. A sponsorship is public. A sponsor's inbox
   * is not.
   */
  add column if not exists sponsor_email citext
    check (sponsor_email is null or char_length(sponsor_email) <= 254),

  /*
   * When we last sent them the kit, and who to.
   *
   * The address is stored alongside the timestamp rather than only the
   * timestamp, because the question this answers is not "have we ever emailed
   * about this box" but "have we emailed *this address* about this box". An
   * admin correcting a typo in the address has a business that has still not
   * been told; an admin editing the prize wording has one that has.
   *
   * That distinction is the whole anti-spam rule: the kit goes out when the
   * address is new or changed, and on no other save. Without it, every edit to
   * a sponsored box — a nudged blurb, a re-uploaded logo — would post another
   * email to somebody who already has the link.
   */
  add column if not exists sponsor_kit_sent_at timestamptz,
  add column if not exists sponsor_kit_sent_to citext;

-- An address with no sponsor is an address we would never use and could not
-- explain. Same shape as every other rule in 0053: the parts hang off the name.
alter table public.boxes
  drop constraint if exists boxes_sponsor_email_needs_sponsor;

alter table public.boxes
  add constraint boxes_sponsor_email_needs_sponsor check (
    sponsor_email is null or sponsor_name is not null
  );

-- ---------------------------------------------------------------------------
-- Tell PostgREST
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
