// What a box costs to put up, and how the money splits.

import {
  KOBO,
  MAX_LENGTH,
  MAX_STAKE_KOBO,
  MIN_LENGTH,
  PLATFORM_SHARE_PERCENT,
} from "@/lib/constants";

/**
 * The minimum stake for a password of a given length, in kobo.
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
    schedule.push(Math.min(naira * KOBO, MAX_STAKE_KOBO));
  }
  return schedule;
}

const SCHEDULE = buildSchedule();

export function minStakeKobo(length: number): number {
  const clamped = Math.min(Math.max(Math.trunc(length), MIN_LENGTH), MAX_LENGTH);
  return SCHEDULE[clamped - MIN_LENGTH];
}

/** The whole ladder, for the Build screen's "what does this cost?" table. */
export function stakeSchedule(): { length: number; minStakeKobo: number }[] {
  return SCHEDULE.map((minStakeKobo, i) => ({
    length: MIN_LENGTH + i,
    minStakeKobo,
  }));
}

/**
 * A contributor may always stake *more* than the minimum for a bigger prize,
 * but never more than the transfer cap.
 */
export function stakeIsValid(length: number, stakeKobo: number): boolean {
  return (
    Number.isSafeInteger(stakeKobo) &&
    stakeKobo >= minStakeKobo(length) &&
    stakeKobo <= MAX_STAKE_KOBO
  );
}

export interface Split {
  stakeKobo: number;
  prizeKobo: number;
  platformKobo: number;
}

/**
 * 70% of a stake becomes the prize the player is chasing; Spendbox keeps 30%
 * for running the box. Rounding goes to the platform so the advertised prize
 * is never a kobo short of what a winner is paid.
 */
export function splitStake(stakeKobo: number): Split {
  const platformKobo = Math.ceil((stakeKobo * PLATFORM_SHARE_PERCENT) / 100);
  return { stakeKobo, prizeKobo: stakeKobo - platformKobo, platformKobo };
}

/** ₦1,234,500 rather than 123450000. */
export function formatNaira(kobo: number): string {
  return `₦${Math.round(kobo / KOBO).toLocaleString("en-NG")}`;
}
