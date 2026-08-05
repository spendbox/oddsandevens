// How full the vault looks.
//
// The prize is money, and money on a screen is a number nobody feels. A stack
// of gold bars in a room is a quantity you can read across the room and compare
// between boxes without arithmetic — which is the whole reason the play screen
// stopped printing the figure at the top and started building it out of objects.
//
// The scale is fixed rather than relative. Every vault in the game holds the
// same maximum, so a half-full one is half-full of the *same* thing wherever
// you see it; scaling each vault to its own reward would make every box look
// identically stuffed and the comparison would say nothing.

import { KOBO } from "@/lib/constants";

/**
 * A full vault. Deliberately the same as the largest reward the funding ladder
 * can produce, so the fullest box in the game is a full room and nothing is
 * ever clipped.
 */
export const VAULT_CAPACITY_KOBO = 10_000_000 * KOBO;

/** Bars in a full vault: seven to a row, six rows. */
export const BARS_PER_ROW = 7;
export const VAULT_ROWS = 6;
export const VAULT_BARS = BARS_PER_ROW * VAULT_ROWS;

/**
 * Bars for a reward.
 *
 * Rounded up, and never zero for a box with money in it: a ₦12,000 prize is a
 * very small pile, but an empty room would say there is nothing to win, which
 * is a lie about the one fact that matters. A challenge box — no money at all —
 * gets nothing, which is true.
 */
export function barsFor(rewardKobo: number): number {
  if (rewardKobo <= 0) return 0;
  const share = Math.min(1, rewardKobo / VAULT_CAPACITY_KOBO);
  return Math.max(1, Math.min(VAULT_BARS, Math.ceil(share * VAULT_BARS)));
}

/** How full the room is, 0–1. Drives the glow, not the count. */
export function fullness(rewardKobo: number): number {
  return Math.max(0, Math.min(1, rewardKobo / VAULT_CAPACITY_KOBO));
}

/**
 * The stack, bottom row first.
 *
 * Bars settle like real ones: each row fills before the next begins, and a
 * part-filled top row is centred rather than left-aligned, because a pile with
 * a ragged left edge reads as a rendering fault and a pile with a peak reads as
 * a pile.
 */
export function stackRows(bars: number): number[] {
  const rows: number[] = [];
  let left = bars;
  for (let r = 0; r < VAULT_ROWS && left > 0; r++) {
    const take = Math.min(BARS_PER_ROW, left);
    rows.push(take);
    left -= take;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// The hour of the day
// ---------------------------------------------------------------------------

export type Daypart = "dawn" | "day" | "dusk" | "night";

/**
 * Which sky to draw.
 *
 * Read from the player's own clock, so somebody hunting at 2am gets a night
 * heist and somebody on a lunch break gets sunshine. It has no effect on
 * anything the game decides — it is weather, and the one thing on this screen
 * that is about the person rather than the box.
 */
export function daypartAt(hour: number): Daypart {
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}
