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
 * kinds of near-miss are worth different amounts, *and so are different
 * characters*, so a total that could have come from several combinations is far
 * harder to read than four labelled counts. That opacity is the game.
 *
 * The second half of that is what stops a percentage being a character count in
 * disguise. Characters are not interchangeable and nothing on the scale is a
 * round fraction of anything, so "25%" says a quarter of this password's worth
 * was found and refuses to say whether that was one character or three.
 *
 * 100% means solved and nothing else does: the score is measured against what
 * the password is worth *plus* whatever an over-long guess padded it out with,
 * so padding a correct prefix dilutes it rather than being free.
 */
export interface Verdict {
  lengthHint: LengthHint;
  /** 0–100, to two decimal places. */
  scorePercent: number;
}

/**
 * The verdict taken apart — sold, not given.
 *
 * Turning one opaque number into four labelled ones is the single most useful
 * thing a player can buy, which is why it costs what it costs. Withheld on the
 * server rather than hidden in the browser: `buildPlayView` never puts these on
 * the wire for a hunt that hasn't bought them.
 *
 * Four rather than three, because place and case are independent questions and
 * a character can get either, both or neither right. The two wrong-place
 * outcomes currently earn the same, but they are still counted apart: which of
 * them a character landed in is a different fact about the guess, and folding
 * them together would throw that away for nothing.
 *
 * Knowing all four still doesn't give you the total, and since characters
 * stopped being interchangeable it isn't close. The counts say how many
 * characters landed each way; they say nothing about *which*, and which is what
 * the percentage is made of. Two attempts with identical breakdowns routinely
 * score differently. That is the game, and it is why this is worth buying
 * without being an answer key.
 */
export interface Breakdown {
  /** Right character, right place, right case. */
  exact: number;
  /** Right letter, right place, wrong case. */
  miscase: number;
  /** Right character, right case, sitting somewhere else in the password. */
  elsewhere: number;
  /** Right letter, wrong case, sitting somewhere else. */
  elsewhereMiscase: number;
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
