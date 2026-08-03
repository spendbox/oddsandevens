// How hard a box is, in a number a person can act on.
//
// "26 characters" means nothing to somebody deciding whether to spend their
// month on a box — and can't be shown anyway, since the length is the first
// thing a player has to find. "Merciless, around 1,900 attempts" means quite a
// lot. The figure is measured against a solver rather than guessed: see the
// model below, which reproduces the measurements to within a percent.

import {
  ALPHABET,
  KOBO,
  LIFE_PRICE_KOBO,
  LIVES_MAX,
  LIFE_REGEN_MINUTES,
  MAX_LENGTH,
  MIN_LENGTH,
} from "@/lib/constants";

/** Binary-searching the length over the 24 possibilities. */
const LENGTH_SEARCH = Math.ceil(Math.log2(MAX_LENGTH - MIN_LENGTH + 1));

/**
 * Attempts a methodical player needs, playing for free.
 *
 * The strategy the scoring permits, and its cost:
 *
 *  1. **Find the length.** The only length signal is shorter/longer/exact, so
 *     it's a binary search — about 5 attempts.
 *
 *  2. **Then one position at a time, scanning the whole alphabet.** This is
 *     where the cost lives, and why it is so much higher than a colour-grid
 *     game. A score is a single number, so the only safe reading of a position
 *     is "try everything and keep the best" — thresholds on the delta don't
 *     work, because the character already sitting there may itself be scoring,
 *     and because a misplaced character is worth more than a right-place
 *     wrong-case one. Only an exact hit is guaranteed to top the scale, and
 *     proving you've found it means trying every other character: 73 of them.
 *
 * A solver implementing exactly this measures 224 attempts at three characters
 * and 1,904 at twenty-six. The formula below reproduces both.
 */
export function estimateAttempts(length: number): number {
  const clamped = Math.min(Math.max(Math.trunc(length), MIN_LENGTH), MAX_LENGTH);
  return LENGTH_SEARCH + clamped * (ALPHABET.length - 1);
}

/**
 * The same, for a player who has bought Colour Read.
 *
 * With the components visible, an exact hit announces itself the moment it
 * lands and the scan can stop there — so the search per position halves, from
 * "try all 73" to "try until it works, about 37". That is what the power-up
 * buys, and it is roughly half the game.
 */
export function estimateAttemptsWithBreakdown(length: number): number {
  const clamped = Math.min(Math.max(Math.trunc(length), MIN_LENGTH), MAX_LENGTH);
  return LENGTH_SEARCH + clamped * Math.round(ALPHABET.length / 2);
}

export const DIFFICULTY_TIERS = ["Warm", "Tricky", "Hard", "Brutal", "Merciless"] as const;
export type Difficulty = (typeof DIFFICULTY_TIERS)[number];

/** Tiered on length, because that is the thing a contributor actually picks. */
export function difficultyOf(length: number): Difficulty {
  if (length <= 5) return "Warm";
  if (length <= 9) return "Tricky";
  if (length <= 15) return "Hard";
  if (length <= 21) return "Brutal";
  return "Merciless";
}

/**
 * Days of free play a box represents: attempts divided by the lives that
 * accrue in a day. This is the honest answer to "how long will this take me?"
 * for somebody who refuses to pay, which is most people.
 */
export function daysOfFreeLives(attempts: number): number {
  const livesPerDay = (60 / LIFE_REGEN_MINUTES) * 24;
  return attempts / livesPerDay;
}

/**
 * What it would cost to buy every attempt outright.
 *
 * Shown to contributors next to the reward on purpose. A box whose reward
 * exceeds this number can be solved at a profit by anyone patient enough to be
 * systematic, and a contributor deserves to see that before funding it rather
 * than after somebody demonstrates it.
 */
export function bruteForceCostKobo(length: number): number {
  return estimateAttempts(length) * LIFE_PRICE_KOBO;
}

export interface DifficultyView {
  length: number;
  difficulty: Difficulty;
  estimatedAttempts: number;
  freeDays: number;
  bruteForceCostKobo: number;
  /** True when the reward is worth more than buying every attempt. */
  underpriced: boolean;
}

export function difficultyView(length: number, rewardKobo: number): DifficultyView {
  const estimatedAttempts = estimateAttempts(length);
  const cost = bruteForceCostKobo(length);
  return {
    length,
    difficulty: difficultyOf(length),
    estimatedAttempts,
    freeDays: daysOfFreeLives(estimatedAttempts),
    bruteForceCostKobo: cost,
    underpriced: rewardKobo > cost,
  };
}

/** "~1,900" — a precise-looking number would be a lie about a model. */
export function roughly(attempts: number): string {
  if (attempts < 100) return `~${Math.round(attempts / 5) * 5}`;
  if (attempts < 1000) return `~${Math.round(attempts / 10) * 10}`;
  return `~${(Math.round(attempts / 50) * 50).toLocaleString("en-NG")}`;
}

/** "4 days" / "3 weeks" — free-play time, phrased the way people think. */
export function freeTime(days: number): string {
  if (days < 1) return "under a day";
  if (days < 14) return `${Math.round(days)} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

/** Lives a full pool represents, for copy that mentions it. */
export const LIVES_PER_DAY = (60 / LIFE_REGEN_MINUTES) * 24;
export { LIVES_MAX, KOBO };
