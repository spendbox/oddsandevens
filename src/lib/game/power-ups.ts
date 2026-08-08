// Power-ups: the only thing a player ever has to pay for, and the biggest
// part of what a contributor earns back.
//
// **Everything here is priced as a share of the box's reward.** A hint that
// saves you a week of grinding on a ₦7,000,000 safe is not worth the same as
// the same hint on a ₦7,000 one, and a flat price got that badly wrong in both
// directions. A floor keeps them saleable on a box with nothing behind it.
//
// Each one is tied to a specific thing the scoring withholds:
//
//   Length Lock  the length, which is hidden
//   The counters one number each: capitals, lowercase, symbols, digits,
//                spaces, vowels, consonants
//   Second Wind  the life pool, which is the pace of the whole game
//   Colour Read  the components behind a score, which are withheld by default
//   X-Ray        half the characters, unordered
//
// The counters replaced Case Map, which sold all four composition numbers at
// one price. Sold separately they are seven decisions instead of one, and each
// can be priced by how much it actually cuts the search: knowing there are no
// symbols removes about thirty characters from every position, knowing there
// are two spaces removes one — so they are not worth the same and no longer
// cost the same.
//
// Everything except the catalogue is server-only: `apply` reads the password.
// What reaches the browser is the accumulated `Revealed` state, which is the
// *result* of a purchase and never the password.

import { randomInt } from "node:crypto";
import { KOBO } from "@/lib/constants";
import { splitSale, type FundingOverrides } from "@/lib/game/rewards";

export const POWER_UP_KINDS = [
  "length_lock",
  "upper_case",
  "lower_case",
  "symbol_count",
  "digit_count",
  "space_count",
  "vowel_scan",
  "consonant_scan",
  "second_wind",
  "breakdown",
  "x_ray",
  "power_pack",
] as const;
export type PowerUpKind = (typeof POWER_UP_KINDS)[number];

/**
 * What a Life Bank raises the ceiling to, and for how long.
 *
 * Not a power-up any more. It never was one really — every other thing on the
 * shelf is a fact about *this* password, and this is a change to the life pool,
 * which is shared across every safe. It is sold beside lives now, where the
 * rest of the pool economy lives, and it is a week rather than a permanence:
 * ₦2,500 buys seven days of the raised ceiling.
 */
export const LIFE_BANK_MAX = 24;
export const LIFE_BANK_DAYS = 7;

/**
 * The counters, and the class of character each one counts.
 *
 * Keyed by the field they write into `Revealed.scans`, so there is exactly one
 * place that says what a "vowel" is and the shelf copy, the counting and the
 * panel all read it from there.
 */
export const SCANS = {
  upper_case: { field: "upper", noun: "capitals" },
  lower_case: { field: "lower", noun: "lowercase letters" },
  symbol_count: { field: "symbols", noun: "symbols" },
  digit_count: { field: "numbers", noun: "digits" },
  space_count: { field: "spaces", noun: "spaces" },
  vowel_scan: { field: "vowels", noun: "vowels" },
  consonant_scan: { field: "consonants", noun: "consonants" },
} as const satisfies Record<string, { field: ScanField; noun: string }>;

export type ScanKind = keyof typeof SCANS;

/** The character classes a password can be counted by. */
export type ScanField =
  | "upper"
  | "lower"
  | "symbols"
  | "numbers"
  | "spaces"
  | "vowels"
  | "consonants";

export function isScanKind(kind: PowerUpKind): kind is ScanKind {
  return kind in SCANS;
}

/**
 * Whether one character belongs to one class.
 *
 * Classes overlap on purpose and this is why it is a set of predicates rather
 * than the single `classOf` it used to be: `A` is a capital *and* a vowel, and
 * somebody who has bought both counters has paid to be told both.
 */
const MATCHES: Record<ScanField, (ch: string) => boolean> = {
  upper: (ch) => /[A-Z]/.test(ch),
  lower: (ch) => /[a-z]/.test(ch),
  numbers: (ch) => /[0-9]/.test(ch),
  spaces: (ch) => ch === " ",
  symbols: (ch) => !/[A-Za-z0-9]/.test(ch) && ch !== " ",
  vowels: (ch) => /[aeiou]/i.test(ch),
  consonants: (ch) => /[a-z]/i.test(ch) && !/[aeiou]/i.test(ch),
};

/** How many characters of one class the password holds. */
function countClass(secret: string, field: ScanField): number {
  let n = 0;
  for (const ch of secret) if (MATCHES[field](ch)) n += 1;
  return n;
}

/** Colour Read and Second Wind rent rather than sell. */
export const BREAKDOWN_HOURS = 24;

/**
 * Second Wind, in minutes rather than hours.
 *
 * It was an hour, and an hour of unlimited free guessing is a lot of the game
 * for half a percent of the reward: a methodical player with a fast finger can
 * take several hundred attempts inside one, which made buying Second Wind
 * repeatedly the cheapest route through a large safe rather than a way out of
 * a wait. Halving it to thirty helped and did not settle it — the same route
 * simply cost twice as much, and a fast finger still had time to walk an
 * alphabet through a position inside one window.
 *
 * Fifteen is short enough that the purchase has to be *aimed*. You buy it
 * holding a hypothesis you want to test right now, not as a general licence to
 * grind, and that is the thing it was always meant to be: a way out of waiting
 * an hour for a life when you are three characters from the answer.
 *
 * Minutes because it is no longer a whole number of hours, and a duration that
 * has to be phrased two different ways in six places is a duration that will
 * eventually be phrased wrongly in one of them — `secondWindLabel()` is the
 * only thing allowed to word it now.
 */
export const SECOND_WIND_MINUTES: number = 15;

/** "30 minutes" / "an hour" / "2 hours" — one wording, everywhere. */
export function secondWindLabel(): string {
  if (SECOND_WIND_MINUTES < 60) return `${SECOND_WIND_MINUTES} minutes`;
  if (SECOND_WIND_MINUTES === 60) return "an hour";
  return `${SECOND_WIND_MINUTES / 60} hours`;
}

/** X-Ray shows this much of the password's distinct characters, unordered. */
export const XRAY_SHARE = 0.5;

/**
 * The Power Pack, as a share of the reward.
 *
 * Thirty percent, and deliberately less than the shelf adds up to: the eleven
 * things on it come to a little under half a reward bought separately, so this
 * is roughly a third off for taking all of them at once. That discount is the
 * product. Somebody buying the whole shelf is giving up the part of the game
 * where you decide *which* hint is worth having, and the price should say so.
 *
 * Admin-editable through the same override path as every other power-up, since
 * it is a kind like the rest — `pricing.powerUps.power_pack.share`.
 */
export const POWER_PACK_SHARE = 0.3;

export interface PowerUpSpec {
  kind: PowerUpKind;
  name: string;
  /** One line, for the shelf. */
  blurb: string;
  /** The full explanation, for the dialog that opens before payment. */
  detail: string;
  /** What it does *not* do — the honest half of the pitch. */
  caveat: string;
  /** Share of the box's reward, as a fraction. */
  share: number;
  /** The least it can ever cost, so a challenge box still has a shelf. */
  floorKobo: number;
  /**
   * How often it can be bought on one box.
   *
   * `once` means the answer it gives is permanent and complete — a length
   * doesn't change, and neither does what the password is made of, so buying
   * it twice would pay for the same sentence. `hourly`/`daily` rent a window
   * instead and are buyable again the moment it lapses.
   *
   * Worth saying out loud on the dialog: "can I buy this again?" is the first
   * thing anyone wonders.
   */
  repeat: "once" | "hourly" | "daily";
}

export const POWER_UPS: Record<PowerUpKind, PowerUpSpec> = {
  length_lock: {
    kind: "length_lock",
    name: "Length Lock",
    blurb: "Tells you exactly how many characters the password has.",
    detail:
      "The password's length is the first thing you have to work out, and the only free clue is whether a guess was too short, too long or right — a binary search that costs you lives to run. This ends it: you're told the number outright and every guess after this one can be the right length.",
    caveat: "It says how many characters, never which ones.",
    share: 0.005,
    floorKobo: 200 * KOBO,
    repeat: "once",
  },

  // The counters. One number each, and the number is the whole product — which
  // is why every one of them sells once and says so on the shelf. They are
  // priced by how much of the search each one actually removes, which is why
  // they are nothing like the same price.
  symbol_count: {
    kind: "symbol_count",
    name: "Symbol Count",
    blurb: "Counts the symbols — anything that isn't a letter, a digit or a space.",
    detail:
      "Tells you how many characters are symbols: punctuation, brackets, currency marks, anything off the top row. It is the largest single cut on the shelf, because there are more symbols than anything else — a count of zero removes about thirty candidates from every position at once, and a count of two tells you exactly how much of that space is still in play.",
    caveat: "A count, and only of symbols. Never which ones, never where.",
    share: 0.1,
    floorKobo: 400 * KOBO,
    repeat: "once",
  },
  upper_case: {
    kind: "upper_case",
    name: "Capital Count",
    blurb: "Counts the capital letters.",
    detail:
      "Tells you how many characters are capitals. Case is the thing this game is hardest about — the same letter in the wrong case scores as a near miss and nothing more — so knowing how many capitals exist tells you how much of your work is finding letters and how much is flipping ones you already have.",
    caveat: "A count of capitals. Never which letters, never where they sit.",
    share: 0.09,
    floorKobo: 350 * KOBO,
    repeat: "once",
  },
  lower_case: {
    kind: "lower_case",
    name: "Lowercase Count",
    blurb: "Counts the lowercase letters.",
    detail:
      "Tells you how many characters are lowercase letters. Next to the capital count it settles the shape of the whole password: the two together say how many characters are letters at all, and therefore how many are digits, symbols or spaces.",
    caveat: "A count of lowercase letters. Never which ones, never where.",
    share: 0.085,
    floorKobo: 350 * KOBO,
    repeat: "once",
  },
  digit_count: {
    kind: "digit_count",
    name: "Digit Count",
    blurb: "Counts the digits, 0 through 9.",
    detail:
      "Tells you how many characters are digits. Most passwords people write have one, two or none, and knowing which of those three you are looking at changes where every remaining guess should go.",
    caveat: "A count of digits. Never which ones, never where they sit.",
    share: 0.075,
    floorKobo: 300 * KOBO,
    repeat: "once",
  },
  space_count: {
    kind: "space_count",
    name: "Space Count",
    blurb: "Counts the spaces.",
    detail:
      "Tells you how many characters are spaces. A password with spaces in it is a phrase, and a phrase is attacked completely differently from a string — the count also tells you how many words you are looking for, which is one more than the number of spaces.",
    caveat: "A count of spaces. Never where the gaps fall.",
    share: 0.05,
    floorKobo: 250 * KOBO,
    repeat: "once",
  },
  second_wind: {
    kind: "second_wind",
    name: "Second Wind",
    blurb: `Unlimited guesses on this box for ${secondWindLabel()}. Costs no lives at all.`,
    detail: `For ${secondWindLabel()}, guesses on this box are free — your life pool isn't touched and there's no waiting between attempts. It is the only way to work fast: everything else on this shelf tells you something, and this gives you the time to use it.`,
    caveat: `The clock starts as soon as you pay, and it only covers this box.`,
    share: 0.005,
    floorKobo: 300 * KOBO,
    repeat: "hourly",
  },
  breakdown: {
    kind: "breakdown",
    name: "Colour Read",
    blurb: `Splits every score into its parts, past attempts included. Lasts ${BREAKDOWN_HOURS} hours.`,
    detail: `A score is a sum, and a sum can be reached many ways — which is exactly why one number is so hard to read. This splits every attempt into four: how many characters landed exactly, how many were the right letter in the wrong case, how many are the right character sitting somewhere else, and how many are in the password but in the other case *and* another position. It applies backwards too, so every attempt you've already made is re-explained the moment you buy it. Measured against a solver, it roughly halves the work of cracking a box.`,
    caveat: `${BREAKDOWN_HOURS} hours, then it lapses and can be bought again. It gives you the counts, never which positions they refer to, and never the arithmetic behind the score.`,
    share: 0.015,
    floorKobo: 500 * KOBO,
    repeat: "daily",
  },
  x_ray: {
    kind: "x_ray",
    name: "X-Ray",
    blurb: "Reveals half the password's distinct characters, in no order.",
    detail:
      "Names half of the different characters the password is built from — the actual characters, with their case. It does not say where any of them go, how many times each appears, or what the other half are. On a long password this is the single biggest cut to the search: every character it names is one you can stop hunting for. It sells once, so the half it doesn't name is a half you have to find.",
    caveat:
      "Half the distinct characters, rounded up, chosen at random. Unordered, and it says nothing about position. One purchase — the other half stays hidden.",
    share: 0.05,
    floorKobo: 1_000 * KOBO,
    repeat: "once",
  },

  vowel_scan: {
    kind: "vowel_scan",
    name: "Vowel Scan",
    blurb: "Counts the vowels — A, E, I, O and U, either case.",
    detail:
      "Tells you how many of the characters are vowels. It is the cheapest thing on the shelf and often the most telling: five candidates out of ninety-five, so the count is usually small and a small count is a strong statement about whether you are looking at words or at noise.",
    caveat: "A count of A, E, I, O and U in either case. Y doesn't count.",
    share: 0.005,
    floorKobo: 200 * KOBO,
    repeat: "once",
  },
  consonant_scan: {
    kind: "consonant_scan",
    name: "Consonant Scan",
    blurb: "Counts the consonants — every letter that isn't a vowel.",
    detail:
      "Tells you how many of the characters are consonants. Two and a half times the price of a Vowel Scan and worth it: there are four times as many consonants as vowels, so the same number rules out four times as much — and next to the vowel count it settles how many characters are letters at all.",
    caveat: "A count of the letters that aren't vowels. Y counts as one.",
    // 2.5× the Vowel Scan, deliberately: 21 letters against 5.
    share: 0.0125,
    floorKobo: 500 * KOBO,
    repeat: "once",
  },

  power_pack: {
    kind: "power_pack",
    name: "Power Pack",
    blurb: "Every power-up still on this shelf, in one purchase.",
    detail:
      "Everything above that you haven't already bought, applied in one go: the length, every count, half the characters, the score split into its parts, and a free run to use it all in. Priced as a share of the reward rather than as the sum of its parts, so it is always cheaper than buying them one at a time — the discount is for committing, and for giving up the pleasure of working out which hint to buy next.",
    caveat:
      "It buys what is still available and nothing else, so it is worth least to somebody who has already bought most of the shelf — the price does not drop to match. It never tells you the password.",
    share: POWER_PACK_SHARE,
    floorKobo: 2_000 * KOBO,
    repeat: "once",
  },
};

/**
 * What a power-up costs on a given box.
 *
 * A share of the reward, floored so that a box with nothing behind it — the
 * platform's own challenges — still has something to sell. Rounded to the
 * nearest naira, because a price ending in kobo looks like a mistake.
 */
export function priceKobo(
  kind: PowerUpKind,
  rewardKobo: number,
  /** What an admin has changed, if anything. */
  prices?: PriceOverrides
): number {
  const spec = POWER_UPS[kind];
  const over = prices?.powerUps?.[kind];
  const share = Math.round((rewardKobo * (over?.share ?? spec.share)) / KOBO) * KOBO;
  return Math.max(MIN_PRICE_KOBO, over?.floorKobo ?? spec.floorKobo, share);
}

/**
 * Prices an admin has changed, read from `platform_settings` at request time.
 *
 * Passed down rather than imported, because the catalogue is a pure module and
 * has to stay one: it is used by the FAQ, the revenue estimate and a browser
 * bundle, none of which can reach the database. The two places that actually
 * *charge* money — the power-up checkout and the play view that quotes it —
 * load the overrides and hand them in.
 */
export interface PriceOverrides {
  powerUps?: Partial<Record<PowerUpKind, { share?: number; floorKobo?: number }>>;
  /** What Spendbox keeps of every sale. */
  platformSharePercent?: number;
  lifePriceKobo?: number;
  /** A week of the raised life ceiling. */
  lifeBankKobo?: number;
  /** The least a contributor may put behind a box, per password length. */
  funding?: FundingOverrides;
}

/**
 * The least anything on this shelf may ever cost.
 *
 * Not a design choice — Paystack will not take a transaction below ₦100, so a
 * price under it is a checkout that opens and then fails. Every floor above is
 * already higher; this is the backstop that makes it impossible to introduce
 * one that isn't, on a box small enough for the share to fall through it.
 */
export const MIN_PRICE_KOBO = 100 * KOBO;

/**
 * A price with a claimed drop taken off it.
 *
 * Shared between the shelf, which shows the number, and the checkout route,
 * which charges it. Two roundings of the same discount that disagreed by a
 * naira would be a player told one price and billed another — which is the
 * kind of thing that is technically trivial and completely unforgivable.
 */
export function discountedKobo(fullKobo: number, percentOff: number): number {
  const off = Math.max(0, Math.min(100, percentOff));
  return Math.max(1, Math.round((fullKobo * (100 - off)) / 100));
}

export function isPowerUpKind(value: string): value is PowerUpKind {
  return (POWER_UP_KINDS as readonly string[]).includes(value);
}

/**
 * The split on a power-up sale. The contributor whose box was attacked keeps
 * 70%; Spendbox keeps 30%. On the public box there is no contributor, so the
 * whole thing is platform revenue — the caller decides that, not this.
 */
export const splitPowerUp = splitSale;

// ---------------------------------------------------------------------------
// What a hunt knows so far
// ---------------------------------------------------------------------------

/**
 * Everything power-ups have handed this hunt. Stored on `hunts.revealed` and
 * sent to the browser as-is: the player has paid for all of it.
 */
export interface Revealed {
  /** The password's length, once Length Lock has been bought. */
  length: number | null;
  /** X-Ray's answer so far: distinct characters it has named, unordered. */
  charset: string[] | null;
  /**
   * How many distinct characters the password has in total, known once X-Ray
   * has been bought at least once.
   *
   * Stored because availability depends on it — the shelf has to know whether
   * there's anything left to name. It discloses nothing new: the note the
   * first purchase produces already says "4 of the 7 characters it uses".
   */
  charsetTotal: number | null;
  /**
   * What the counters have counted so far.
   *
   * A field is absent until the counter that fills it has been paid for, and a
   * count of zero is a real, purchased answer — so `undefined` and `0` mean
   * genuinely different things here and nothing may collapse them.
   */
  scans: Partial<Record<ScanField, number>>;
  /** When Colour Read lapses, or null if it isn't running. */
  breakdownUntil: string | null;
  /** When Second Wind lapses. While it runs, guesses cost no lives. */
  secondWindUntil: string | null;
  /** How many of each power-up this hunt has bought. */
  used: Partial<Record<PowerUpKind, number>>;
}

export const EMPTY_REVEALED: Revealed = {
  length: null,
  charset: null,
  charsetTotal: null,
  scans: {},
  breakdownUntil: null,
  secondWindUntil: null,
  used: {},
};

/** Reads a `hunts.revealed` jsonb blob back into a shape with no holes in it. */
export function parseRevealed(raw: unknown): Revealed {
  const value = (raw ?? {}) as Partial<Revealed> & {
    /** Case Map's old answer, on hunts that bought it before it was retired. */
    caseMap?: { upper: number; lower: number; digits: number; specials: number };
  };

  /*
   * Case Map's four numbers are the counters' four numbers, so a hunt that
   * paid for it keeps them — folded into `scans` on read rather than left in a
   * legacy field the whole app has to keep knowing about. Anything the player
   * has since bought individually wins, because it was bought later.
   */
  const legacy = value.caseMap
    ? {
        upper: value.caseMap.upper,
        lower: value.caseMap.lower,
        numbers: value.caseMap.digits,
        symbols: value.caseMap.specials,
      }
    : {};

  return {
    length: typeof value.length === "number" ? value.length : null,
    charset: Array.isArray(value.charset) ? value.charset : null,
    charsetTotal:
      typeof value.charsetTotal === "number" ? value.charsetTotal : null,
    scans:
      value.scans && typeof value.scans === "object"
        ? { ...legacy, ...value.scans }
        : legacy,
    breakdownUntil:
      typeof value.breakdownUntil === "string" ? value.breakdownUntil : null,
    secondWindUntil:
      typeof value.secondWindUntil === "string" ? value.secondWindUntil : null,
    used: value.used ?? {},
  };
}

function running(until: string | null, now: number): boolean {
  return !!until && new Date(until).getTime() > now;
}

/** Whether Colour Read is currently in force. Checked server-side too. */
export function breakdownActive(revealed: Revealed, now = Date.now()): boolean {
  return running(revealed.breakdownUntil, now);
}

/** Whether Second Wind is currently in force — guesses free, no life spent. */
export function secondWindActive(revealed: Revealed, now = Date.now()): boolean {
  return running(revealed.secondWindUntil, now);
}

/**
 * Whether a power-up is worth selling right now.
 *
 * Every rule here is decided from public facts — what the player has already
 * bought, and a length they have already paid to learn — precisely so that a
 * greyed-out button never becomes a free hint. Anything that would need the
 * password to decide stays on sale.
 */
export function isAvailable(kind: PowerUpKind, revealed: Revealed): boolean {
  // The pack is worth selling exactly when something is left to put in it.
  // Asking the rest of the shelf rather than keeping its own flag is what
  // stops it being buyable as an empty box on a hunt that has bought
  // everything — and it is why this branch comes before the scan check.
  if (kind === "power_pack") return packContents(revealed).length > 0;

  // The counters, first. Each sells once — a count is permanent and complete,
  // so a second sale would be a second copy of the same number.
  if (isScanKind(kind)) return revealed.scans[SCANS[kind].field] === undefined;

  switch (kind) {
    case "length_lock":
      return revealed.length === null;
    case "second_wind":
      // Re-buyable the moment it lapses. The window is short on purpose.
      return !secondWindActive(revealed);
    case "breakdown":
      return !breakdownActive(revealed);
    case "x_ray":
      // Once. It used to sell repeatedly, drawing from what it hadn't named
      // yet — which meant enough purchases eventually named the whole
      // alphabet of the password and turned the biggest hint on the shelf
      // into a complete answer for anybody willing to keep paying. Half, and
      // then you work.
      return revealed.charset === null;
  }
}

/**
 * Everything the pack would apply, in shelf order.
 *
 * Every kind except itself that is still available on this hunt. Order matters
 * and is the catalogue's: X-Ray draws from what is *not already known*, so
 * running it after the counters is running it against the same pool it would
 * have had alone, and running the free window last means its clock starts once
 * everything it is meant to be used on has landed.
 */
export function packContents(revealed: Revealed): PowerUpKind[] {
  return POWER_UP_KINDS.filter(
    (kind) => kind !== "power_pack" && isAvailable(kind, revealed)
  );
}

/**
 * One power-up as the browser sees it.
 *
 * Note what it does *not* extend: `PowerUpSpec`. The share and the floor stay
 * on the server. A player is told what something costs on this box, not the
 * formula that got there — spreading `spec` would have put the percentage in
 * the API response for anyone who opened the network tab, which is the same
 * disclosure as printing it on the page and harder to notice.
 */
export interface Offering {
  kind: PowerUpKind;
  name: string;
  blurb: string;
  detail: string;
  caveat: string;
  repeat: PowerUpSpec["repeat"];
  priceKobo: number;
  available: boolean;
  /** When this one lapses, if it's currently running. */
  activeUntil: string | null;
}

/**
 * The catalogue as the play screen shows it, priced against this box.
 *
 * **Cheapest first.** The shelf used to be in catalogue order, which is the
 * order they were written in and means nothing to anybody looking at it — so a
 * ₦70,000 counter sat above a ₦3,500 one and the cheap end of the shelf was
 * somewhere in the middle. Price is the axis a player is actually sorting by.
 */
export function offerings(
  revealed: Revealed,
  rewardKobo: number,
  prices?: PriceOverrides
): Offering[] {
  return POWER_UP_KINDS.map((kind) => {
    const { name, blurb, detail, caveat, repeat } = POWER_UPS[kind];
    return {
      kind,
      name,
      blurb,
      detail,
      caveat,
      repeat,
      priceKobo: priceKobo(kind, rewardKobo, prices),
      available: isAvailable(kind, revealed),
      activeUntil:
        kind === "breakdown"
          ? revealed.breakdownUntil
          : kind === "second_wind"
            ? revealed.secondWindUntil
            : null,
    };
  }).sort((a, b) => a.priceKobo - b.priceKobo);
}

// ---------------------------------------------------------------------------
// Applying one
// ---------------------------------------------------------------------------

/**
 * Runs a paid-for power-up against the password and returns the new state of
 * the hunt, plus a line of copy telling the player what they just bought.
 *
 * Called once, from the webhook or the verify route, after Paystack confirms
 * the money — never speculatively.
 */
export function apply(
  kind: PowerUpKind,
  secret: string,
  before: Revealed
): { revealed: Revealed; note: string } {
  /*
   * The pack is not an effect of its own — it is every other effect, folded.
   *
   * Recursing through `apply` rather than reimplementing the eleven cases is
   * the whole point: there is exactly one description of what X-Ray does, and
   * a pack that had its own copy would be a second one to keep in step. The
   * fold threads `revealed` through, so each step sees what the step before it
   * revealed, which is what makes X-Ray draw from the right pool.
   */
  if (kind === "power_pack") {
    const contents = packContents(before);
    let revealed: Revealed = {
      ...before,
      used: { ...before.used, power_pack: (before.used.power_pack ?? 0) + 1 },
    };
    const notes: string[] = [];
    for (const one of contents) {
      const step = apply(one, secret, revealed);
      revealed = step.revealed;
      notes.push(step.note);
    }
    return {
      revealed,
      note: notes.length > 0 ? notes.join(" ") : "Nothing left to unpack.",
    };
  }

  const used = { ...before.used, [kind]: (before.used[kind] ?? 0) + 1 };
  const counted = { ...before, used };
  const hours = (n: number) => new Date(Date.now() + n * 60 * 60 * 1000).toISOString();
  const minutes = (n: number) => new Date(Date.now() + n * 60 * 1000).toISOString();

  if (isScanKind(kind)) {
    const { field, noun } = SCANS[kind];
    const n = countClass(secret, field);
    return {
      revealed: { ...counted, scans: { ...counted.scans, [field]: n } },
      note:
        n === 0
          ? `No ${noun} at all.`
          : `${n} ${n === 1 ? noun.replace(/s$/, "") : noun}.`,
    };
  }

  switch (kind) {
    case "length_lock":
      return {
        revealed: { ...counted, length: secret.length },
        note: `The password is ${secret.length} characters long.`,
      };

    case "second_wind":
      return {
        revealed: { ...counted, secondWindUntil: minutes(SECOND_WIND_MINUTES) },
        note: `Guesses on this box are free for the next ${secondWindLabel()}.`,
      };

    case "breakdown":
      return {
        revealed: { ...counted, breakdownUntil: hours(BREAKDOWN_HOURS) },
        note: `Every score is split into its parts for the next ${BREAKDOWN_HOURS} hours — the ones you already made included.`,
      };

    case "x_ray": {
      // Half of what this hunt *doesn't already know*, chosen at random and
      // sorted before it's shown so the order gives nothing away.
      //
      // Drawing from the remainder rather than from the whole set is what
      // makes a second purchase worth making: a fresh draw over everything
      // would mostly re-name characters already paid for, which would be a
      // sale of nothing. This way each purchase always adds something, and
      // enough of them eventually name the lot.
      const distinct = [...new Set(secret.split(""))];
      const known = new Set(before.charset ?? []);
      const pool = distinct.filter((ch) => !known.has(ch));

      const take = Math.max(1, Math.ceil(pool.length * XRAY_SHARE));
      const picked: string[] = [];
      for (let i = 0; i < take && pool.length > 0; i++) {
        picked.push(pool.splice(randomInt(pool.length), 1)[0]);
      }

      const charset = [...known, ...picked].sort();
      const left = distinct.length - charset.length;
      return {
        revealed: { ...counted, charset, charsetTotal: distinct.length },
        note:
          `${picked.length} more of the ${distinct.length} characters it uses: ${picked.join(" ")}.` +
          (left > 0 ? ` ${left} still hidden.` : " That's all of them."),
      };
    }
  }
}
