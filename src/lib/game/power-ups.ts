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
//   Life Bank    the ceiling on the life pool itself
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
import { KOBO, LIVES_MAX } from "@/lib/constants";
import { splitSale } from "@/lib/game/rewards";

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
  "life_bank",
] as const;
export type PowerUpKind = (typeof POWER_UP_KINDS)[number];

/** What a Life Bank raises the ceiling to. */
export const LIFE_BANK_MAX = 24;

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
export const SECOND_WIND_HOURS = 1;

/** X-Ray shows this much of the password's distinct characters, unordered. */
export const XRAY_SHARE = 0.5;

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
   * instead and are buyable again the moment it lapses. `partial` hands over
   * a slice of something bigger and can be bought until there's none left.
   *
   * Worth saying out loud on the dialog: "can I buy this again?" is the first
   * thing anyone wonders.
   */
  repeat: "once" | "partial" | "hourly" | "daily";
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
    blurb: `Unlimited guesses on this box for ${SECOND_WIND_HOURS} hour. Costs no lives at all.`,
    detail: `For one hour, guesses on this box are free — your life pool isn't touched and there's no waiting between attempts. It is the only way to work fast: everything else on this shelf tells you something, and this gives you the time to use it.`,
    caveat: `The hour starts as soon as you pay, and it only covers this box.`,
    share: 0.005,
    floorKobo: 300 * KOBO,
    repeat: "hourly",
  },
  breakdown: {
    kind: "breakdown",
    name: "Colour Read",
    blurb: `Splits every score into its parts, past attempts included. Lasts ${BREAKDOWN_HOURS} hours.`,
    detail: `A score is a sum, and a sum can be reached many ways — which is exactly why one number is so hard to read. This splits every attempt into three: how many characters landed exactly, how many were the right letter in the wrong case, and how many are in the password but somewhere else. It applies backwards too, so every attempt you've already made is re-explained the moment you buy it. Measured against a solver, it roughly halves the work of cracking a box.`,
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
      "Names half of the different characters the password is built from — the actual characters, with their case. It does not say where any of them go, how many times each appears, or what the other half are. On a long password this is the single biggest cut to the search: every character it names is one you can stop hunting for.",
    caveat:
      "Half of what you don't already know, rounded up, chosen at random. Unordered, and it says nothing about position.",
    share: 0.05,
    floorKobo: 1_000 * KOBO,
    repeat: "partial",
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

  life_bank: {
    kind: "life_bank",
    name: "Life Bank",
    blurb: `Raises your life ceiling from ${LIVES_MAX} to ${LIFE_BANK_MAX}, permanently.`,
    detail: `The only thing on this shelf that isn't about the password. Your pool refills one life an hour and stops at ${LIVES_MAX} — so an evening away is ${LIVES_MAX} guesses banked and every hour after that wasted. This raises the ceiling to ${LIFE_BANK_MAX} and fills you to it on the spot: a full day of accrual now banks instead of overflowing, which on a long hunt is worth far more than any single hint.`,
    caveat: `It buys headroom, not speed — lives still come back one an hour. The new ceiling is yours for good and works on every box, not just this one.`,
    share: 0.007,
    floorKobo: 300 * KOBO,
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
export function priceKobo(kind: PowerUpKind, rewardKobo: number): number {
  const spec = POWER_UPS[kind];
  const share = Math.round((rewardKobo * spec.share) / KOBO) * KOBO;
  return Math.max(MIN_PRICE_KOBO, spec.floorKobo, share);
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
  // The counters, first. Each sells once — a count is permanent and complete,
  // so a second sale would be a second copy of the same number.
  if (isScanKind(kind)) return revealed.scans[SCANS[kind].field] === undefined;

  switch (kind) {
    case "length_lock":
      return revealed.length === null;
    case "life_bank":
      // A ceiling can only be raised once. It is raised on the player rather
      // than on the hunt, but it is *recorded* here so the shelf on this box
      // stops offering it.
      return !revealed.used.life_bank;
    case "second_wind":
      // Re-buyable the moment it lapses. An hour is short on purpose.
      return !secondWindActive(revealed);
    case "breakdown":
      return !breakdownActive(revealed);
    case "x_ray":
      // Buyable until there is nothing left to name. Each purchase draws from
      // the characters it *hasn't* shown you, so a second one is never a
      // second copy of the first — and once the whole set is out, the shelf
      // stops selling it rather than taking money for nothing.
      //
      // Both facts this reads are ones the player has already paid for and
      // been told, so a greyed-out button still leaks nothing.
      return (
        revealed.charset === null ||
        revealed.charsetTotal === null ||
        revealed.charset.length < revealed.charsetTotal
      );
  }
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

/** The catalogue as the play screen shows it, priced against this box. */
export function offerings(revealed: Revealed, rewardKobo: number): Offering[] {
  return POWER_UP_KINDS.map((kind) => {
    const { name, blurb, detail, caveat, repeat } = POWER_UPS[kind];
    return {
      kind,
      name,
      blurb,
      detail,
      caveat,
      repeat,
      priceKobo: priceKobo(kind, rewardKobo),
      available: isAvailable(kind, revealed),
      activeUntil:
        kind === "breakdown"
          ? revealed.breakdownUntil
          : kind === "second_wind"
            ? revealed.secondWindUntil
            : null,
    };
  });
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
  const used = { ...before.used, [kind]: (before.used[kind] ?? 0) + 1 };
  const counted = { ...before, used };
  const hours = (n: number) => new Date(Date.now() + n * 60 * 60 * 1000).toISOString();

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

    case "life_bank":
      // Nothing about the password. The ceiling itself is raised by the
      // settlement, against the player rather than the hunt — this only
      // records the purchase so the shelf stops offering it.
      return {
        revealed: counted,
        note: `Your life ceiling is ${LIFE_BANK_MAX} from now on, on every box.`,
      };

    case "second_wind":
      return {
        revealed: { ...counted, secondWindUntil: hours(SECOND_WIND_HOURS) },
        note: `Guesses on this box are free for the next hour.`,
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
