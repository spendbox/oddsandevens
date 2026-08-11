// The business behind a box: reading one out of a row, and checking one on its
// way in.
//
// A sponsorship is six nullable columns on `boxes` (0053) that only mean
// anything together, which is exactly the shape that rots if every caller
// assembles it by hand. So there is one function that turns those columns into
// a `Sponsor` and one that turns an admin's form into those columns, and
// neither the routes nor the components ever touch a `sponsor_` field directly.
//
// The nesting is the rule, and both functions enforce the same one: a prize
// belongs to a sponsor, and a picture belongs to a prize. Nothing here invents
// a level that wasn't filled in — a half-written sponsorship comes back as
// `null` rather than as an object with an empty name in it, because a card that
// says "Sponsored by" and then stops is worse than a card that says nothing.

import { EMAIL_REGEX } from "@/lib/constants";
import type { Sponsor, SponsorMedia } from "@/lib/types";

/**
 * The limits, mirrored from `0053_sponsored_boxes.sql`.
 *
 * The migration is the authority — these exist so a form can count characters
 * without a round trip, and so a route can answer "too long" with a 400 rather
 * than letting a check constraint answer it with a 500.
 */
export const SPONSOR_NAME_MAX = 40;
export const SPONSOR_PRIZE_TITLE_MAX = 60;
export const SPONSOR_PRIZE_BLURB_MAX = 240;

/**
 * What the `sponsors` bucket will take, and how big.
 *
 * No SVG. An SVG is a document that can carry script, and one served back from
 * our own origin — which is what a public bucket does — is stored XSS wearing a
 * logo. Next's optimiser refuses them too unless `dangerouslyAllowSVG` is set,
 * and the name of that flag is the whole argument. Every business has a PNG.
 */
export const SPONSOR_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export const SPONSOR_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;

/**
 * Images are capped far below the bucket's own ceiling.
 *
 * A logo is kilobytes and a product shot is a few hundred of them. The 25MB
 * the bucket allows is there for the video and nothing else, and letting a
 * 20MB PNG through it would put that PNG at the top of the front page.
 */
export const SPONSOR_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const SPONSOR_VIDEO_MAX_BYTES = 25 * 1024 * 1024;

/**
 * The six columns, as they come out of the database.
 *
 * The names themselves are listed in `PUBLIC_BOX_COLUMNS` rather than here, and
 * that duplication is forced: supabase-js reads a `select` string at the type
 * level, so a column list assembled out of constants widens to `string` and
 * takes the return type of every query with it.
 */
export interface SponsorRow {
  sponsor_name: string | null;
  sponsor_logo_url: string | null;
  sponsor_prize_title: string | null;
  sponsor_prize_blurb: string | null;
  sponsor_prize_media_url: string | null;
  sponsor_prize_media_kind: string | null;
}

/**
 * The sponsor on a box, or null when there isn't one.
 *
 * Every level is dropped the moment the level above it is missing, which makes
 * this total over rows the constraints in 0053 forbid but an older row, a
 * hand-edited one or a future migration could still produce. A prize with no
 * sponsor is not rendered as an orphan; it is not rendered.
 */
export function toSponsor(row: Partial<SponsorRow>): Sponsor | null {
  const name = row.sponsor_name?.trim();
  if (!name) return null;

  const title = row.sponsor_prize_title?.trim();
  const blurb = row.sponsor_prize_blurb?.trim();

  return {
    name,
    logoUrl: row.sponsor_logo_url || null,
    prize: title
      ? {
          title,
          blurb: blurb || null,
          media: toMedia(row.sponsor_prize_media_url, row.sponsor_prize_media_kind),
        }
      : null,
  };
}

function toMedia(
  url: string | null | undefined,
  kind: string | null | undefined
): SponsorMedia | null {
  if (!url) return null;
  // The kind is the thing that decides between an `<img>` and a `<video>`, so
  // an unrecognised one is no media at all rather than a coin toss that draws a
  // black rectangle where the reward should be.
  if (kind !== "image" && kind !== "video") return null;
  return { url, kind };
}

/** What an admin typed, before it is anything. */
export interface SponsorInput {
  name?: unknown;
  logoUrl?: unknown;
  prizeTitle?: unknown;
  prizeBlurb?: unknown;
  prizeMediaUrl?: unknown;
  prizeMediaKind?: unknown;
  /** Where to send the share kit. Optional; a sponsorship works without one. */
  email?: unknown;
}

/**
 * What actually gets written, which is the six public columns plus the one
 * that must never travel.
 *
 * `sponsor_email` is deliberately not on `SponsorRow`: that type is what
 * `BoxRow` extends and therefore what every public read carries, and a
 * business's contact address has no business in a browser. Keeping the write
 * shape separate is what makes it impossible to leak by adding a field to the
 * wrong interface.
 */
export type SponsorWriteColumns = SponsorRow & { sponsor_email: string | null };

export type SponsorPatch =
  | { ok: true; columns: SponsorWriteColumns }
  | { ok: false; error: string };

/**
 * An admin's form, turned into the six columns — or a reason it can't be.
 *
 * Clearing is a first-class answer, not an oversight: a sponsorship that has
 * run its course has to be removable without deleting the box, so an empty
 * name nulls all six. That is why this returns the whole set every time rather
 * than only the fields that were filled in. A partial update would make
 * "remove the video" impossible to express.
 */
export function toSponsorColumns(input: SponsorInput): SponsorPatch {
  const name = text(input.name);
  const empty: SponsorWriteColumns = {
    sponsor_email: null,
    sponsor_name: null,
    sponsor_logo_url: null,
    sponsor_prize_title: null,
    sponsor_prize_blurb: null,
    sponsor_prize_media_url: null,
    sponsor_prize_media_kind: null,
  };

  if (!name) return { ok: true, columns: empty };
  if (name.length > SPONSOR_NAME_MAX) return { ok: false, error: "sponsor_name_too_long" };

  /*
   * The address is lower-cased before it is stored or compared.
   *
   * The column is `citext`, so the database would treat two casings as one
   * anyway — but "have we already emailed this address" is decided in
   * TypeScript, by comparing what was sent against what is on the row, and
   * that comparison is case-sensitive. Without this, correcting `Ada@` to
   * `ada@` reads as a new address and posts a second kit.
   */
  const email = text(input.email)?.toLowerCase() ?? null;
  if (email && !EMAIL_REGEX.test(email)) return { ok: false, error: "invalid_email" };

  const logoUrl = text(input.logoUrl);
  if (logoUrl && !isOurAsset(logoUrl)) return { ok: false, error: "invalid_logo" };

  const prizeTitle = text(input.prizeTitle);
  if (prizeTitle && prizeTitle.length > SPONSOR_PRIZE_TITLE_MAX) {
    return { ok: false, error: "prize_title_too_long" };
  }

  // Everything below the title falls away with it. An admin who clears the
  // title of a prize has removed the prize, and leaving its description and its
  // video behind would leave the box carrying a film of something nobody is
  // being given.
  if (!prizeTitle) {
    return {
      ok: true,
      columns: { ...empty, sponsor_name: name, sponsor_logo_url: logoUrl, sponsor_email: email },
    };
  }

  const prizeBlurb = text(input.prizeBlurb);
  if (prizeBlurb && prizeBlurb.length > SPONSOR_PRIZE_BLURB_MAX) {
    return { ok: false, error: "prize_blurb_too_long" };
  }

  const mediaUrl = text(input.prizeMediaUrl);
  const mediaKind = text(input.prizeMediaKind);
  if (mediaUrl && !isOurAsset(mediaUrl)) return { ok: false, error: "invalid_media" };
  if (mediaUrl && mediaKind !== "image" && mediaKind !== "video") {
    return { ok: false, error: "invalid_media" };
  }

  return {
    ok: true,
    columns: {
      sponsor_email: email,
      sponsor_name: name,
      sponsor_logo_url: logoUrl,
      sponsor_prize_title: prizeTitle,
      sponsor_prize_blurb: prizeBlurb,
      sponsor_prize_media_url: mediaUrl,
      // Both or neither, which is also what the constraint says.
      sponsor_prize_media_kind: mediaUrl ? mediaKind : null,
    },
  };
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Whether a URL is one of ours.
 *
 * The admin screen only ever sends back a URL the upload route just handed it,
 * so this is not a defence against an admin. It is a defence against the column
 * becoming a place to point the front page at somebody else's server: an
 * arbitrary URL in `sponsor_logo_url` is a request every visitor makes to a
 * third party, and `next/image` would refuse to load it anyway because it isn't
 * in `remotePatterns`. Better to refuse it where the reason can be explained.
 */
function isOurAsset(url: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}
