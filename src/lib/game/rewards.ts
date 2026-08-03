// What a box costs to put up, and how the money splits.
//
// Two numbers, and keeping them straight matters:
//
//   funding  what the contributor pays in.
//   reward   what the player who cracks it takes home — 70% of the funding.
//
// The remaining 30% is what Spendbox keeps for running the box. Players only
// ever see the reward; contributors see both.

import {
  KOBO,
  MAX_FUNDING_KOBO,
  MAX_LENGTH,
  MIN_LENGTH,
  PLATFORM_SHARE_PERCENT,
} from "@/lib/constants";

/**
 * The minimum funding for a password of a given length, in kobo.
 *
 * A three-character box is ₦10,000 to open. After that each extra character
 * costs more than the last — ₦50,000, then ₦100,000, ₦250,000, ₦500,000 —
 * until the step settles at ₦500,000 a character, because a longer password
 * is a harder box and a harder box has to be worth attacking. The schedule is
 * built so that the 26-character ceiling lands exactly on the ₦10,000,000 cap,
 * which is the largest single transfer Paystack will make.
 */
const STEPS_NAIRA = [50_000, 100_000, 250_000, 500_000];
const BASE_NAIRA = 10_000;

function buildSchedule(): number[] {
  // Index i holds the minimum for length (MIN_LENGTH + i), in kobo.
  const schedule: number[] = [BASE_NAIRA * KOBO];
  let naira = BASE_NAIRA;
  for (let length = MIN_LENGTH + 1; length <= MAX_LENGTH; length++) {
    const step = STEPS_NAIRA[Math.min(length - MIN_LENGTH - 1, STEPS_NAIRA.length - 1)];
    naira += step;
    schedule.push(Math.min(naira * KOBO, MAX_FUNDING_KOBO));
  }
  return schedule;
}

const SCHEDULE = buildSchedule();

export function minFundingKobo(length: number): number {
  const clamped = Math.min(Math.max(Math.trunc(length), MIN_LENGTH), MAX_LENGTH);
  return SCHEDULE[clamped - MIN_LENGTH];
}

/** The whole ladder, for the Build screen's "what does this cost?" table. */
export function fundingSchedule(): { length: number; minFundingKobo: number }[] {
  return SCHEDULE.map((minFundingKobo, i) => ({
    length: MIN_LENGTH + i,
    minFundingKobo,
  }));
}

/**
 * A contributor may always put up *more* than the minimum for a bigger
 * reward, but never more than the transfer cap.
 */
export function fundingIsValid(length: number, fundingKobo: number): boolean {
  return (
    Number.isSafeInteger(fundingKobo) &&
    fundingKobo >= minFundingKobo(length) &&
    fundingKobo <= MAX_FUNDING_KOBO
  );
}

export interface Split {
  fundingKobo: number;
  rewardKobo: number;
  platformKobo: number;
}

/**
 * 70% of the funding becomes the reward the player is chasing; Spendbox keeps
 * 30% for running the box. Rounding goes to the platform so the advertised
 * reward is never a kobo short of what a winner is paid.
 *
 * Mirrored by `raise_reward` in the migrations — change both together.
 */
export function splitFunding(fundingKobo: number): Split {
  const platformKobo = Math.ceil((fundingKobo * PLATFORM_SHARE_PERCENT) / 100);
  return { fundingKobo, rewardKobo: fundingKobo - platformKobo, platformKobo };
}

/** ₦1,234,500 rather than 123450000. */
export function formatNaira(kobo: number): string {
  return `₦${Math.round(kobo / KOBO).toLocaleString("en-NG")}`;
}

/**
 * The reward as a player should read it.
 *
 * A box with nothing behind it isn't worth ₦0 — it's a challenge, and printing
 * "₦0" makes it look broken rather than deliberate. The platform's own boxes
 * are sometimes exactly that.
 */
export function rewardLabel(rewardKobo: number): string {
  return rewardKobo > 0 ? formatNaira(rewardKobo) : "Challenge";
}

export function isChallenge(rewardKobo: number): boolean {
  return rewardKobo <= 0;
}
