// What a box is likely to earn its contributor.
//
// A contributor about to put ₦1,000,000 behind a password reasonably wants to
// know what comes back. The honest answer is a range with its workings shown,
// not a single confident number — so this returns both ends and every input
// that went into them, and the UI prints the arithmetic next to the figures.
//
// Two things earn:
//
//   **Power-ups.** Priced as a share of the reward, so a box worth more sells
//   more expensive hints. 70% of every one goes to the contributor.
//
//   **Lives.** Also 70%. A life is bought because a particular safe is in
//   front of somebody, and it now pays the person who put that safe up.
//
// Funding is not income. It's the reward, and it leaves.

import { LIFE_PRICE_KOBO } from "@/lib/constants";
import { POWER_UP_KINDS, priceKobo } from "@/lib/game/power-ups";
import { CONTRIBUTOR_SHARE_PERCENT, splitSale } from "@/lib/game/rewards";

/**
 * Not every hunter buys anything. Most people try a box, get nowhere and
 * wander off; the ones who stay are the ones who spend. A quarter is a
 * deliberately conservative guess and is stated as such wherever it's shown,
 * because a number a contributor plans around ought to be one they can check.
 */
export const SPENDING_SHARE = 0.25;

/**
 * Lives bought by a hunter at the top of the range.
 *
 * The pool refills on its own — seven at a time, one an hour — so nobody has
 * to buy any, and the low end of the range assumes nobody does. Twenty is
 * roughly a day's impatience: a hunter who doesn't want to wait out the clock
 * on an evening's session. It is a guess, it is labelled as one on screen, and
 * it is the single assumption here most worth disagreeing with.
 */
export const LIVES_PER_SPENDER = 20;

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
  /** The reward the shelf was priced against. */
  rewardKobo: number;
  /** Gross price of the cheapest thing on the shelf, on this box. */
  cheapestKobo: number;
  /** Gross price of every power-up on this box, bought once each. */
  fullShelfKobo: number;
  /** Gross price of the lives assumed at the top of the range. */
  livesKobo: number;
  livesPerSpender: number;
  sharePercent: number;
}

/**
 * The range per thousand hunters, for a box with this reward behind it.
 *
 * Low end: a quarter of them buy the cheapest single power-up and nothing
 * else, and never pay for a life.
 * High end: a quarter of them buy the whole shelf and twenty lives.
 *
 * Both ends are the contributor's 70% share, not the gross.
 */
export function revenueRange(rewardKobo: number, hunters: number = BASIS): RevenueRange {
  const prices = POWER_UP_KINDS.map((kind) => priceKobo(kind, rewardKobo));
  const cheapestKobo = Math.min(...prices);
  const fullShelfKobo = prices.reduce((total, price) => total + price, 0);
  const livesKobo = LIVES_PER_SPENDER * LIFE_PRICE_KOBO;

  const spenders = Math.max(0, Math.round(hunters * SPENDING_SHARE));
  const low = splitSale(cheapestKobo).contributorKobo * spenders;
  const high = splitSale(fullShelfKobo + livesKobo).contributorKobo * spenders;

  return {
    lowKobo: low,
    highKobo: high,
    hunters,
    spenders,
    rewardKobo,
    cheapestKobo,
    fullShelfKobo,
    livesKobo,
    livesPerSpender: LIVES_PER_SPENDER,
    sharePercent: CONTRIBUTOR_SHARE_PERCENT,
  };
}
