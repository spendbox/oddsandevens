// What an attempt tells you.
//
// The scoring itself lives in Postgres (`score_attempt`), where the password
// is and where it stays. This module is the shape of the answer and the words
// wrapped around it — everything the browser is allowed to know.

/** Whether the guess was shorter than, longer than, or the right length. */
export type LengthHint = "shorter" | "longer" | "exact";

/**
 * What every attempt earns: one number.
 *
 * A percentage of a perfect guess, where a perfect guess is the password
 * itself. **How it is arrived at is deliberately undocumented** — different
 * kinds of near-miss are worth different amounts, and a total that could have
 * come from several combinations is far harder to read than three labelled
 * counts. That opacity is the game.
 *
 * 100% means solved and nothing else does: the score is measured against the
 * longer of the guess and the password, so padding a correct prefix out dilutes
 * it rather than being free.
 */
export interface Verdict {
  lengthHint: LengthHint;
  /** 0–100, to two decimal places. */
  scorePercent: number;
}

/**
 * The verdict taken apart — sold, not given.
 *
 * Turning one opaque number into three labelled ones is the single most useful
 * thing a player can buy, which is why it costs what it costs. Withheld on the
 * server rather than hidden in the browser: `buildPlayView` never puts these on
 * the wire for a hunt that hasn't bought them.
 */
export interface Breakdown {
  /** Right character, right place, right case. */
  exact: number;
  /** Right letter, right place, wrong case. */
  miscase: number;
  /** Right character, sitting somewhere else in the password. */
  elsewhere: number;
}

/**
 * A guess is only worth spending a life on if it is in-alphabet and not empty.
 * Length is deliberately *not* checked: not knowing how long the password is
 * is the point, and probing lengths is a legitimate move.
 */
export function isWellFormed(guess: string, alphabet: Set<string>, maxLength: number): boolean {
  if (guess.length === 0 || guess.length > maxLength) return false;
  for (const ch of guess) {
    if (!alphabet.has(ch)) return false;
  }
  return true;
}

export const LENGTH_HINT_COPY: Record<LengthHint, string> = {
  shorter: "Add characters",
  longer: "Remove characters",
  exact: "Right length",
};

/**
 * The score as it's printed.
 *
 * One decimal place, always. Two would give away more of the arithmetic; zero
 * would erase the signal entirely on a long password, where a single
 * near-miss can be worth a few tenths of a percent and rounding it to "0%"
 * would look identical to having found nothing at all.
 */
export function formatScore(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

/**
 * How warm a score is, for colouring it.
 *
 * Bands rather than a gradient: a player comparing two attempts should be able
 * to see at a glance that one is in a better neighbourhood, without the colour
 * pretending to more precision than the number has.
 */
export function scoreBand(percent: number): "cold" | "cool" | "warm" | "hot" | "solved" {
  if (percent >= 100) return "solved";
  if (percent >= 75) return "hot";
  if (percent >= 45) return "warm";
  if (percent > 0) return "cool";
  return "cold";
}
