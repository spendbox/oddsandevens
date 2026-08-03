// How hard a box is, in a number a person can act on.
//
// "26 characters" means nothing to somebody deciding whether to spend their
// afternoon on a box. "About 630 attempts, which is four weeks of free lives"
// means quite a lot. Both the player and the contributor see the same figure,
// derived the same way, because a reward is only fair if the work behind it is
// legible before you start.

import {
  CHARACTER_CLASSES,
  KOBO,
  LIFE_PRICE_KOBO,
  LIVES_MAX,
  LIFE_REGEN_MINUTES,
  MAX_LENGTH,
  MIN_LENGTH,
} from "@/lib/constants";

/**
 * Attempts a methodical player needs, on average.
 *
 * The model is the strategy the feedback actually permits, not a guess:
 *
 *  1. **Find the length.** The only length signal is shorter/longer/exact, so
 *     it's a binary search over the 24 possible lengths — about 5 attempts.
 *
 *  2. **Then one position at a time.** Because the verdict is a *count* with
 *     no positions attached, the only way to learn about a single position is
 *     to change that position alone and watch the count move. Each attempt
 *     therefore tests one candidate at one position, and a wrong-case hit
 *     resolves the case for free — so the search per position runs over the
 *     48 case-folded classes, landing in about half of them on average.
 *
 * The last position falls out by elimination, which is where the `- 1` comes
 * from. This is a floor for a good player, not a ceiling for anyone else.
 */
export function estimateAttempts(length: number): number {
  const clamped = Math.min(Math.max(Math.trunc(length), MIN_LENGTH), MAX_LENGTH);
  const lengthSearch = Math.ceil(Math.log2(MAX_LENGTH - MIN_LENGTH + 1));
  const perPosition = CHARACTER_CLASSES / 2;
  return Math.round(lengthSearch + (clamped - 1) * perPosition);
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
 * exceeds this number can be solved at a profit by anyone patient enough to
 * be systematic, and a contributor deserves to see that before funding it
 * rather than after somebody demonstrates it.
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

/** "about 630" — a precise-looking number would be a lie about a model. */
export function roughly(attempts: number): string {
  if (attempts < 100) return `~${Math.round(attempts / 5) * 5}`;
  if (attempts < 1000) return `~${Math.round(attempts / 10) * 10}`;
  return `~${Math.round(attempts / 50) * 50}`;
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
