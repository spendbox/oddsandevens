// Power-ups: the only thing a player ever has to pay for, and the only way a
// contributor makes money back.
//
// Everything here except the catalogue is server-only — `apply` reads the
// password. What reaches the browser is the accumulated `Revealed` state,
// which is deliberately the *result* of a purchase and never the password.

import { randomInt } from "node:crypto";
import { ALPHABET, KOBO, PLATFORM_SHARE_PERCENT } from "@/lib/constants";

export const POWER_UP_KINDS = [
  "sweep",
  "second_wind",
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

/** Second Wind is repeatable, but not indefinitely — a run has to end. */
export const SECOND_WIND_GUESSES = 3;
export const SECOND_WIND_MAX = 3;

export const POWER_UPS: Record<PowerUpKind, PowerUp> = {
  sweep: {
    kind: "sweep",
    name: "Sweep",
    blurb: `Strikes ${SWEEP_SIZE} characters off the keyboard that the password definitely doesn't use.`,
    priceKobo: 500 * KOBO,
  },
  second_wind: {
    kind: "second_wind",
    name: "Second Wind",
    blurb: `${SECOND_WIND_GUESSES} more guesses on this attempt. Up to ${SECOND_WIND_MAX} per attempt.`,
    priceKobo: 1_000 * KOBO,
  },
  first_light: {
    kind: "first_light",
    name: "First Light",
    blurb: "Locks in the opening character of the password.",
    priceKobo: 1_500 * KOBO,
  },
  last_light: {
    kind: "last_light",
    name: "Last Light",
    blurb: "Locks in the closing character of the password.",
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
// What a run knows so far
// ---------------------------------------------------------------------------

/**
 * Everything power-ups have handed this run. Stored on `runs.revealed` and
 * sent to the browser as-is: the player has paid for all of it.
 */
export interface Revealed {
  /** Position index (as a string key, because it round-trips through jsonb) → character. */
  positions: Record<string, string>;
  /** Characters proven absent from the password. */
  dead: string[];
  /** X-Ray's answer: every distinct character the password uses. */
  charset: string[] | null;
  /** Guesses added by Second Wind. */
  bonusGuesses: number;
  /** How many of each power-up this run has bought. */
  used: Partial<Record<PowerUpKind, number>>;
}

export const EMPTY_REVEALED: Revealed = {
  positions: {},
  dead: [],
  charset: null,
  bonusGuesses: 0,
  used: {},
};

/** Reads a `runs.revealed` jsonb blob back into a shape with no holes in it. */
export function parseRevealed(raw: unknown): Revealed {
  const value = (raw ?? {}) as Partial<Revealed>;
  return {
    positions: value.positions ?? {},
    dead: Array.isArray(value.dead) ? value.dead : [],
    charset: Array.isArray(value.charset) ? value.charset : null,
    bonusGuesses: Number(value.bonusGuesses ?? 0),
    used: value.used ?? {},
  };
}

/**
 * Whether a power-up is worth selling right now.
 *
 * Every rule here is decided from public facts — the password's length and
 * what the player has already bought — precisely so that a greyed-out button
 * never becomes a free hint. Sweep's rule leans on the fact that a password of
 * length L uses at most L distinct characters, so at least `ALPHABET - L` of
 * them are guaranteed dead; while fewer than that have been struck off, there
 * is certainly something left to strike.
 */
export function isAvailable(
  kind: PowerUpKind,
  revealed: Revealed,
  length: number
): boolean {
  const bought = revealed.used[kind] ?? 0;
  switch (kind) {
    case "sweep":
      return revealed.dead.length < ALPHABET.length - length;
    case "second_wind":
      return bought < SECOND_WIND_MAX;
    case "first_light":
      return revealed.positions["0"] === undefined;
    case "last_light":
      return revealed.positions[String(length - 1)] === undefined;
    case "spotlight":
      return Object.keys(revealed.positions).length < length;
    case "x_ray":
      return revealed.charset === null;
  }
}

/** The catalogue as the play screen shows it, with prices and availability. */
export function offerings(
  revealed: Revealed,
  length: number
): (PowerUp & { available: boolean })[] {
  return POWER_UP_KINDS.map((kind) => ({
    ...POWER_UPS[kind],
    available: isAvailable(kind, revealed, length),
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
 * the run, plus a line of copy telling the player what they just bought.
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
          ? `Struck off ${picked.join(", ")}.`
          : "Nothing left to strike off — every remaining character is in play.",
      };
    }

    case "second_wind":
      return {
        revealed: { ...counted, bonusGuesses: counted.bonusGuesses + SECOND_WIND_GUESSES },
        note: `${SECOND_WIND_GUESSES} more guesses.`,
      };

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
      const hidden = [];
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
        note: `Built from ${charset.join(", ")}.`,
      };
    }
  }
}
