// What a box is likely to earn its contributor.
//
// A contributor about to put ₦1,000,000 behind a password reasonably wants to
// know what comes back. The honest answer is a range with its workings shown,
// not a single confident number — so this returns both ends and the UI prints
// the arithmetic next to them.
//
// The only income a box has is power-ups: 70% of every one bought by somebody
// attacking it. Funding is not income; it's the reward, and it leaves.

import { POWER_UP_KINDS, POWER_UPS, splitPowerUp } from "@/lib/game/power-ups";

/** The cheapest single power-up — one cautious hunter's likely spend. */
export const CHEAPEST_KOBO = Math.min(
  ...POWER_UP_KINDS.map((kind) => POWER_UPS[kind].priceKobo)
);

/** Everything on the shelf — one determined hunter buying the lot. */
export const FULL_SHELF_KOBO = POWER_UP_KINDS.reduce(
  (total, kind) => total + POWER_UPS[kind].priceKobo,
  0
);

/**
 * Not every hunter buys anything. Most people try a box, get nowhere and
 * wander off; the ones who stay are the ones who spend. A quarter is a
 * deliberately conservative guess and is stated as such wherever it's shown,
 * because a number a contributor plans around ought to be one they can check.
 */
export const SPENDING_SHARE = 0.25;

export interface RevenueRange {
  lowKobo: number;
  highKobo: number;
  /** Hunters the range was computed from. */
  hunters: number;
  /** How many of those are assumed to buy anything at all. */
  spenders: number;
  cheapestKobo: number;
  fullShelfKobo: number;
  sharePercent: number;
}

/**
 * The range for a given number of hunters.
 *
 * Low end: a quarter of them buy one Sweep and nothing else.
 * High end: a quarter of them buy the entire shelf.
 *
 * Both ends are the contributor's 70% share, not the gross.
 */
export function revenueRange(hunters: number): RevenueRange {
  const spenders = Math.max(0, Math.round(hunters * SPENDING_SHARE));
  const low = splitPowerUp(CHEAPEST_KOBO).contributorKobo * spenders;
  const high = splitPowerUp(FULL_SHELF_KOBO).contributorKobo * spenders;

  return {
    lowKobo: low,
    highKobo: high,
    hunters,
    spenders,
    cheapestKobo: CHEAPEST_KOBO,
    fullShelfKobo: FULL_SHELF_KOBO,
    sharePercent: 70,
  };
}

/**
 * A per-hundred-hunters figure, for a box nobody has played yet.
 *
 * Quoting "₦0 – ₦0" to somebody who hasn't launched would be useless, and
 * inventing a player count would be a lie, so an unlaunched box is quoted per
 * hundred hunters and the contributor supplies their own expectation.
 */
export const PER_HUNDRED = revenueRange(100);
