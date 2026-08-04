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
//   Case Map     what the password is made of, which the score never says
//   Second Wind  the life pool, which is the pace of the whole game
//   Colour Read  the components behind a score, which are withheld by default
//   X-Ray        half the characters, unordered
//   The scans    one count each: symbols, vowels, consonants, digits
//
// The scans are the cheap end of the shelf on purpose. Case Map is one price
// for four numbers and will always be the better deal for somebody opening a
// box cold; a scan is for the player who is already three-quarters of the way
// through and has exactly one question left.
//
// Everything except the catalogue is server-only: `apply` reads the password.
// What reaches the browser is the accumulated `Revealed` state, which is the
// *result* of a purchase and never the password.

import { randomInt } from "node:crypto";
import { KOBO } from "@/lib/constants";
import { splitSale } from "@/lib/game/rewards";

export const POWER_UP_KINDS = [
  "length_lock",
  "case_map",
  "second_wind",
  "breakdown",
  "x_ray",
  "symbol_scan",
  "vowel_scan",
  "consonant_scan",
  "number_scan",
] as const;
export type PowerUpKind = (typeof POWER_UP_KINDS)[number];

/**
 * The four scans, and the class of character each one counts.
 *
 * Keyed by the field they write into `Revealed.scans`, so there is exactly one
 * place that says what a "vowel" is and the shelf copy, the counting and the
 * panel all read it from there.
 */
export const SCANS = {
  symbol_scan: { field: "symbols", noun: "symbols" },
  vowel_scan: { field: "vowels", noun: "vowels" },
  consonant_scan: { field: "consonants", noun: "consonants" },
  number_scan: { field: "numbers", noun: "digits" },
} as const satisfies Record<string, { field: ScanField; noun: string }>;

export type ScanKind = keyof typeof SCANS;
export type ScanField = "symbols" | "vowels" | "consonants" | "numbers";

export function isScanKind(kind: PowerUpKind): kind is ScanKind {
  return kind in SCANS;
}

/** Which class one character belongs to, or null if it counts for none. */
function classOf(ch: string): ScanField | null {
  if (/[0-9]/.test(ch)) return "numbers";
  if (/[aeiou]/i.test(ch)) return "vowels";
  if (/[a-z]/i.test(ch)) return "consonants";
  return "symbols";
}

/** How many characters of one class the password holds. */
function countClass(secret: string, field: ScanField): number {
  let n = 0;
  for (const ch of secret) if (classOf(ch) === field) n += 1;
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
    share: 0.0025,
    floorKobo: 200 * KOBO,
    repeat: "once",
  },
  case_map: {
    kind: "case_map",
    name: "Case Map",
    blurb:
      "Counts the uppercase, lowercase, digits and symbols — without saying where any sit.",
    detail:
      "Reveals the composition of the password: how many uppercase letters, lowercase letters, digits, and symbols it contains. This dramatically narrows the search space. In a 94-character alphabet, learning that a password contains no digits immediately eliminates 10 possible characters from every remaining position. Every detail reduces uncertainty, turning a seemingly impossible challenge into a solvable puzzle.",
    caveat:
      "It gives you counts, not characters, and never a position. It covers the digit and symbol counts outright, so Number Scan and Symbol Scan come off the shelf once you own it.",
    // The second most expensive thing on the shelf, and it should be. It is
    // four answers in one — how many capitals, lowercase, digits and symbols —
    // and it retires two of the scans on purchase. At 0.5% it was priced the
    // same as a single scan, which made every scan on the shelf pointless.
    share: 0.05,
    floorKobo: 800 * KOBO,
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

  // The scans. One number each, and the number is the whole product — which is
  // why every one of them sells once and says so on the shelf.
  symbol_scan: {
    kind: "symbol_scan",
    name: "Symbol Scan",
    blurb: "Counts the symbols — anything that isn't a letter or a digit.",
    detail:
      "Tells you how many characters in the password are symbols: punctuation, brackets, currency marks, anything off the top row. It is the cheapest question worth asking, because the answer is often zero — and a zero here removes about thirty characters from every position at once.",
    caveat: "A count, and only of symbols. Never which ones, never where.",
    share: 0.005,
    floorKobo: 200 * KOBO,
    repeat: "once",
  },
  vowel_scan: {
    kind: "vowel_scan",
    name: "Vowel Scan",
    blurb: "Counts the vowels — A, E, I, O and U, either case.",
    detail:
      "Tells you how many of the characters are vowels. Nothing else on the shelf will: Case Map splits letters by case, not by sound. It is the single most useful number for deciding whether you are looking at words or at noise, and words and noise are attacked completely differently.",
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
      "Tells you how many of the characters are consonants. On its own it narrows the alphabet; next to a Vowel Scan it does considerably more than that, because the two together tell you how many characters are letters at all, and therefore how many are not.",
    caveat: "A count of the letters that aren't vowels. Y counts as one.",
    share: 0.005,
    floorKobo: 200 * KOBO,
    repeat: "once",
  },
  number_scan: {
    kind: "number_scan",
    name: "Number Scan",
    blurb: "Counts the digits, 0 through 9.",
    detail:
      "Tells you how many of the characters are digits. Most passwords people write have one, two or none, and knowing which of those three you are in changes where every remaining guess should go.",
    caveat: "A count of digits. Never which ones, never where they sit.",
    share: 0.005,
    floorKobo: 200 * KOBO,
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
  return Math.max(spec.floorKobo, share);
}

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

/** Case Map's answer: how the password is composed, without any positions. */
export interface CaseMap {
  upper: number;
  lower: number;
  digits: number;
  specials: number;
}

/**
 * Everything power-ups have handed this hunt. Stored on `hunts.revealed` and
 * sent to the browser as-is: the player has paid for all of it.
 */
export interface Revealed {
  /** The password's length, once Length Lock has been bought. */
  length: number | null;
  caseMap: CaseMap | null;
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
   * What the scans have counted so far.
   *
   * A field is absent until the scan that fills it has been paid for, and a
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
  caseMap: null,
  charset: null,
  charsetTotal: null,
  scans: {},
  breakdownUntil: null,
  secondWindUntil: null,
  used: {},
};

/** Reads a `hunts.revealed` jsonb blob back into a shape with no holes in it. */
export function parseRevealed(raw: unknown): Revealed {
  const value = (raw ?? {}) as Partial<Revealed>;
  return {
    length: typeof value.length === "number" ? value.length : null,
    caseMap: value.caseMap ?? null,
    charset: Array.isArray(value.charset) ? value.charset : null,
    charsetTotal:
      typeof value.charsetTotal === "number" ? value.charsetTotal : null,
    scans:
      value.scans && typeof value.scans === "object" ? { ...value.scans } : {},
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
  // The scans, first: each sells once, and two of them stop selling early.
  //
  // Case Map already gives the digit and symbol counts, so continuing to offer
  // Number Scan and Symbol Scan afterwards would be taking money for a
  // sentence the player has been shown. Vowel and Consonant Scan survive it —
  // Case Map splits letters by case, which says nothing about sound.
  if (isScanKind(kind)) {
    const { field } = SCANS[kind];
    if (revealed.scans[field] !== undefined) return false;
    if (revealed.caseMap && (field === "numbers" || field === "symbols")) return false;
    return true;
  }

  switch (kind) {
    case "length_lock":
      return revealed.length === null;
    case "case_map":
      return revealed.caseMap === null;
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

    case "case_map": {
      const caseMap: CaseMap = { upper: 0, lower: 0, digits: 0, specials: 0 };
      for (const ch of secret) {
        if (/[A-Z]/.test(ch)) caseMap.upper += 1;
        else if (/[a-z]/.test(ch)) caseMap.lower += 1;
        else if (/[0-9]/.test(ch)) caseMap.digits += 1;
        else caseMap.specials += 1;
      }
      return {
        revealed: { ...counted, caseMap },
        note: `${caseMap.upper} uppercase, ${caseMap.lower} lowercase, ${caseMap.digits} digits, ${caseMap.specials} symbols.`,
      };
    }

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
