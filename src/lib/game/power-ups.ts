// Power-ups: the only thing a player ever has to pay for, and the only way a
// contributor makes money back.
//
// They matter far more than they used to. A box hides its length, cares about
// case, and answers a guess with a single percentage whose arithmetic is never
// disclosed — so a methodical solve runs to hundreds of attempts. Every
// power-up here removes a specific chunk of that work, and each is priced
// roughly against the lives it saves. Colour Read is the largest because it
// changes what every attempt means rather than adding one more fact.
//
// Everything except the catalogue is server-only: `apply` reads the password.
// What reaches the browser is the accumulated `Revealed` state, which is the
// *result* of a purchase and never the password.

import { randomInt } from "node:crypto";
import { ALPHABET, KOBO, PLATFORM_SHARE_PERCENT } from "@/lib/constants";

export const POWER_UP_KINDS = [
  "breakdown",
  "length_lock",
  "sweep",
  "case_map",
  "first_light",
  "last_light",
  "spotlight",
  "x_ray",
] as const;
export type PowerUpKind = (typeof POWER_UP_KINDS)[number];

export interface PowerUp {
  kind: PowerUpKind;
  name: string;
  blurb: string;
  priceKobo: number;
}

/** How many characters one Sweep clears: 5% of the alphabet, rounded up. */
export const SWEEP_SIZE = Math.max(1, Math.ceil(ALPHABET.length * 0.05));

/**
 * How long Colour Read lasts.
 *
 * Alone among the power-ups it rents rather than sells: everything else hands
 * over a fact that stays true forever, while this one changes how the whole
 * board reads and would otherwise be a single purchase that permanently halves
 * the game. A day is long enough to be worth having and short enough that a
 * hunt running to a thousand attempts has to decide when to spend it.
 */
export const BREAKDOWN_HOURS = 24;

export const POWER_UPS: Record<PowerUpKind, PowerUp> = {
  /**
   * The big one, and priced like it.
   *
   * By default a guess comes back as a single percentage, and a single number
   * that could have been arrived at several ways is very hard to reason about.
   * This turns it into three: how much came from exact hits, from the right
   * letter in the wrong case, and from characters sitting somewhere else. It
   * applies to every attempt on the hunt, the ones already made included, so
   * buying it late retroactively explains everything you've done.
   *
   * It lasts 24 hours and can be bought again after that.
   */
  breakdown: {
    kind: "breakdown",
    name: "Colour Read",
    blurb: `Splits every score — past and future — into exact hits, wrong-case hits and characters that are in there somewhere else. Lasts ${BREAKDOWN_HOURS} hours.`,
    priceKobo: 5_000 * KOBO,
  },
  length_lock: {
    kind: "length_lock",
    name: "Length Lock",
    blurb: "Tells you exactly how many characters the password has.",
    priceKobo: 500 * KOBO,
  },
  sweep: {
    kind: "sweep",
    name: "Sweep",
    blurb: `Strikes ${SWEEP_SIZE} characters off the board that the password doesn't use anywhere.`,
    priceKobo: 1_000 * KOBO,
  },
  case_map: {
    kind: "case_map",
    name: "Case Map",
    blurb:
      "Counts the password's uppercase, lowercase, digits and symbols — without saying where any of them sit.",
    priceKobo: 2_500 * KOBO,
  },
  first_light: {
    kind: "first_light",
    name: "First Light",
    blurb: "Locks in the opening character, case and all.",
    priceKobo: 1_500 * KOBO,
  },
  last_light: {
    kind: "last_light",
    name: "Last Light",
    blurb: "Locks in the closing character, case and all.",
    priceKobo: 2_000 * KOBO,
  },
  spotlight: {
    kind: "spotlight",
    name: "Spotlight",
    blurb: "Lights up one position you haven't pinned down yet.",
    priceKobo: 3_500 * KOBO,
  },
  x_ray: {
    kind: "x_ray",
    name: "X-Ray",
    blurb:
      "Shows every character the password is built from — without saying where any of them go.",
    priceKobo: 10_000 * KOBO,
  },
};

export function isPowerUpKind(value: string): value is PowerUpKind {
  return (POWER_UP_KINDS as readonly string[]).includes(value);
}

/**
 * The split on a power-up sale. The contributor whose box was attacked keeps
 * 70%; Spendbox keeps 30%. On the public box there is no contributor, so the
 * whole thing is platform revenue — the caller decides that, not this.
 */
export function splitPowerUp(priceKobo: number): {
  contributorKobo: number;
  platformKobo: number;
} {
  const platformKobo = Math.ceil((priceKobo * PLATFORM_SHARE_PERCENT) / 100);
  return { contributorKobo: priceKobo - platformKobo, platformKobo };
}

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
  /**
   * When Colour Read runs out, or null if it was never bought.
   *
   * The one thing on this record that expires. Everything else here is a fact
   * about the password and stays true; this is a lens on the whole board, and
   * a permanent one would halve the game for a single payment.
   */
  breakdownUntil: string | null;
  /** The password's length, once Length Lock has been bought. */
  length: number | null;
  /** Position index (as a string key, because it round-trips through jsonb) → character. */
  positions: Record<string, string>;
  /** Characters proven absent from the password entirely. */
  dead: string[];
  /** X-Ray's answer: every distinct character the password uses, with case. */
  charset: string[] | null;
  caseMap: CaseMap | null;
  /** How many of each power-up this hunt has bought. */
  used: Partial<Record<PowerUpKind, number>>;
}

export const EMPTY_REVEALED: Revealed = {
  breakdownUntil: null,
  length: null,
  positions: {},
  dead: [],
  charset: null,
  caseMap: null,
  used: {},
};

/** Reads a `hunts.revealed` jsonb blob back into a shape with no holes in it. */
export function parseRevealed(raw: unknown): Revealed {
  const value = (raw ?? {}) as Partial<Revealed>;
  return {
    breakdownUntil:
      typeof value.breakdownUntil === "string" ? value.breakdownUntil : null,
    length: typeof value.length === "number" ? value.length : null,
    positions: value.positions ?? {},
    dead: Array.isArray(value.dead) ? value.dead : [],
    charset: Array.isArray(value.charset) ? value.charset : null,
    caseMap: value.caseMap ?? null,
    used: value.used ?? {},
  };
}

/**
 * Whether Colour Read is currently in force.
 *
 * Checked against a clock rather than a flag, and checked server-side wherever
 * it matters: `buildPlayView` asks this before putting any component count on
 * the wire, so an expired lens stops working even if the browser still has an
 * old page open.
 */
export function breakdownActive(revealed: Revealed, now = Date.now()): boolean {
  if (!revealed.breakdownUntil) return false;
  return new Date(revealed.breakdownUntil).getTime() > now;
}

/**
 * Whether a power-up is worth selling right now.
 *
 * Every rule here is decided from public facts — what the player has already
 * bought, and a length they have already paid to learn — precisely so that a
 * greyed-out button never becomes a free hint. Anything that would need the
 * password to decide stays on sale.
 *
 * Sweep leans on a bound rather than the password: a password of length L uses
 * at most L distinct characters, so at least `ALPHABET − L` are guaranteed
 * absent. Until the length is known the most permissive bound is used, so the
 * button's state still says nothing.
 */
export function isAvailable(kind: PowerUpKind, revealed: Revealed): boolean {
  const bought = revealed.used[kind] ?? 0;
  const known = revealed.length;

  switch (kind) {
    case "breakdown":
      // Re-buyable the moment it lapses; a hunt long enough to need it twice
      // is exactly the hunt it was priced for.
      return !breakdownActive(revealed);
    case "length_lock":
      return known === null;
    case "sweep": {
      const assumed = known ?? 26;
      return revealed.dead.length < ALPHABET.length - assumed;
    }
    case "case_map":
      return revealed.caseMap === null;
    case "first_light":
      return revealed.positions["0"] === undefined;
    case "last_light":
      // Without the length there is no "last" to point at yet.
      return known !== null && revealed.positions[String(known - 1)] === undefined;
    case "spotlight":
      return known === null || Object.keys(revealed.positions).length < known;
    case "x_ray":
      return revealed.charset === null && bought === 0;
  }
}

/** The catalogue as the play screen shows it, with prices and availability. */
export function offerings(revealed: Revealed): (PowerUp & { available: boolean })[] {
  return POWER_UP_KINDS.map((kind) => ({
    ...POWER_UPS[kind],
    available: isAvailable(kind, revealed),
  }));
}

// ---------------------------------------------------------------------------
// Applying one
// ---------------------------------------------------------------------------

function reveal(revealed: Revealed, index: number, secret: string): Revealed {
  return {
    ...revealed,
    positions: { ...revealed.positions, [String(index)]: secret[index] },
  };
}

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

  switch (kind) {
    case "breakdown": {
      const until = new Date(Date.now() + BREAKDOWN_HOURS * 60 * 60 * 1000);
      return {
        revealed: { ...counted, breakdownUntil: until.toISOString() },
        note: `Every score is split into its parts for the next ${BREAKDOWN_HOURS} hours — including the ones you already made.`,
      };
    }

    case "length_lock":
      return {
        revealed: { ...counted, length: secret.length },
        note: `The password is ${secret.length} characters long.`,
      };

    case "sweep": {
      const inSecret = new Set(secret.split(""));
      const known = new Set(counted.dead);
      const candidates = ALPHABET.filter((ch) => !inSecret.has(ch) && !known.has(ch));
      const picked: string[] = [];
      for (let i = 0; i < SWEEP_SIZE && candidates.length > 0; i++) {
        picked.push(candidates.splice(randomInt(candidates.length), 1)[0]);
      }
      return {
        revealed: { ...counted, dead: [...counted.dead, ...picked].sort() },
        note: picked.length
          ? `Struck off ${picked.join(" ")}.`
          : "Nothing left to strike off — every remaining character is in play.",
      };
    }

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

    case "first_light":
      return {
        revealed: reveal(counted, 0, secret),
        note: `The password opens with ${secret[0]}.`,
      };

    case "last_light": {
      const last = secret.length - 1;
      return {
        revealed: reveal(counted, last, secret),
        note: `The password closes with ${secret[last]}.`,
      };
    }

    case "spotlight": {
      const hidden: number[] = [];
      for (let i = 0; i < secret.length; i++) {
        if (counted.positions[String(i)] === undefined) hidden.push(i);
      }
      if (hidden.length === 0) {
        return { revealed: counted, note: "Every position is already lit." };
      }
      const index = hidden[randomInt(hidden.length)];
      return {
        revealed: reveal(counted, index, secret),
        note: `Position ${index + 1} is ${secret[index]}.`,
      };
    }

    case "x_ray": {
      const charset = [...new Set(secret.split(""))].sort();
      return {
        revealed: { ...counted, charset },
        note: `Built from ${charset.join(" ")}.`,
      };
    }
  }
}
