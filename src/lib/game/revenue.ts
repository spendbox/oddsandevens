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

/**
 * The basis every projection is quoted against.
 *
 * Per *thousand* hunters, always — never per box and never per whatever the
 * box happens to have attracted so far. Quoting a live box's real player count
 * looked precise and was useless: a box with four hunters projected four
 * hunters' worth of income, which tells a contributor nothing about whether
 * the box is worth running. A fixed, large basis is a rate, and a rate is the
 * thing you can actually multiply by your own expectations.
 */
export const BASIS = 1000;

export interface RevenueRange {
  lowKobo: number;
  highKobo: number;
  /** Hunters the range was computed from — always `BASIS`. */
  hunters: number;
  /** How many of those are assumed to buy anything at all. */
  spenders: number;
  cheapestKobo: number;
  fullShelfKobo: number;
  sharePercent: number;
}

/**
 * The range per thousand hunters.
 *
 * Low end: a quarter of them buy one Length Lock and nothing else.
 * High end: a quarter of them buy the entire shelf.
 *
 * Both ends are the contributor's 70% share, not the gross.
 */
export function revenueRange(hunters: number = BASIS): RevenueRange {
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

/** The standing rate, which is what every surface quotes. */
export const PER_THOUSAND = revenueRange(BASIS);
