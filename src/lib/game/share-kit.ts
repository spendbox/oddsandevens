// The artwork a sponsor gets to post.
//
// A business that has paid to be on a safe needs two things from us, and the
// placement is only the first. The second is reach they can actually use: a
// link, and pictures already the right shape for the places their customers
// are. "Here is your box, make your own graphic" is how a sponsorship quietly
// produces nothing and doesn't get renewed.
//
// Three, because three covers where a Nigerian business actually posts, and a
// fourth would be a decision rather than a download:
//
//   square    a feed post, and a WhatsApp display picture.
//   story     WhatsApp status, Instagram and Facebook stories. The one that
//             gets used most and the one nobody ever has the right crop for.
//   wide      a link preview, an X post, a website banner.
//
// One design in three crops rather than three designs. A sponsor posting all
// three in a week should look like a campaign, not like three suppliers.

/** The three, in the order the kit page shows them. */
export const SHARE_FORMATS = ["square", "story", "wide"] as const;

export type ShareFormat = (typeof SHARE_FORMATS)[number];

export interface ShareFormatSpec {
  /** Pixel size of the PNG. These are the platforms' own numbers. */
  width: number;
  height: number;
  /** What it is called on the kit page. */
  label: string;
  /** Where it is meant to go, so nobody has to guess which one to pick. */
  usage: string;
  /**
   * How much the design scales relative to the wide crop.
   *
   * The layout is written once at wide-crop proportions and multiplied, which
   * is what keeps the three from drifting into three designs — a headline
   * nudged on the square would otherwise never get nudged on the story.
   */
  scale: number;
}

export const SHARE_SPECS: Record<ShareFormat, ShareFormatSpec> = {
  square: {
    width: 1080,
    height: 1080,
    label: "Square",
    usage: "Instagram and Facebook feed, WhatsApp display picture",
    scale: 1.35,
  },
  story: {
    width: 1080,
    height: 1920,
    label: "Story",
    usage: "WhatsApp status, Instagram and Facebook stories",
    scale: 1.5,
  },
  wide: {
    width: 1200,
    height: 630,
    label: "Wide",
    usage: "X, LinkedIn, link previews, a banner on their own site",
    scale: 1,
  },
};

export function isShareFormat(value: string): value is ShareFormat {
  return (SHARE_FORMATS as readonly string[]).includes(value);
}

/**
 * What a downloaded file is called.
 *
 * It carries the box and the crop, because these land in a folder next to
 * whatever else the business is posting that week and `image (3).png` is how
 * artwork gets lost. Sanitised rather than trusted: the slug is already
 * constrained by `SLUG_REGEX`, but this string becomes a `Content-Disposition`
 * header, and a header is not the place to find out.
 */
export function shareFileName(slug: string, format: ShareFormat): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "spendbox";
  return `spendbox-${safe}-${format}.png`;
}
