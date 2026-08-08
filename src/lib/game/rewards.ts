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
 * What it costs, at the least, to put a password of a given length up.
 *
 * A three-character box is ₦10,000 to open. After that each extra character
 * costs more than the last — ₦50,000, then ₦100,000, ₦250,000, ₦500,000 —
 * until the step settles at ₦500,000 a character, because a longer password
 * is a harder box and a harder box has to be worth attacking. The default
 * schedule is built so that the 26-character ceiling lands exactly on the
 * ₦10,000,000 cap, which is the largest single transfer Paystack will make.
 *
 * Those five numbers are a **default**, not the law: an admin sets them, the
 * same way an admin sets what a life costs. So the ladder is a value that gets
 * passed in rather than a constant in this file, and every function that reads
 * it takes it as an argument — deliberately not an optional one. A caller that
 * quietly fell back to the built-in numbers would be quoting one floor and
 * enforcing another, which is the single thing this must never do.
 */
export interface FundingLadder {
  /** What a password of `MIN_LENGTH` characters costs, in kobo. */
  baseKobo: number;
  /**
   * What each character past `MIN_LENGTH` adds, in kobo — one entry per step,
   * the last of which repeats for every character beyond the list. Four numbers
   * therefore describe all twenty-four lengths.
   */
  stepsKobo: number[];
}

/**
 * What an admin has changed about the ladder.
 *
 * A step is held per slot with `null` meaning "the built-in default for this
 * slot", so clearing one field on the admin screen puts that one step back
 * without disturbing the others — the same rule every other price there
 * follows.
 */
export interface FundingOverrides {
  baseKobo?: number;
  stepsKobo?: (number | null)[];
}

export const DEFAULT_FUNDING_LADDER: FundingLadder = {
  baseKobo: 10_000 * KOBO,
  stepsKobo: [50_000, 100_000, 250_000, 500_000].map((naira) => naira * KOBO),
};

/** How many steps the ladder has. The last one repeats for every length after. */
export const FUNDING_STEPS = DEFAULT_FUNDING_LADDER.stepsKobo.length;

/** Overrides where they exist, the built-in numbers everywhere else. */
export function resolveLadder(overrides?: FundingOverrides | null): FundingLadder {
  return {
    baseKobo: overrides?.baseKobo ?? DEFAULT_FUNDING_LADDER.baseKobo,
    stepsKobo: DEFAULT_FUNDING_LADDER.stepsKobo.map((fallback, i) => {
      const over = overrides?.stepsKobo?.[i];
      return typeof over === "number" && Number.isFinite(over) ? over : fallback;
    }),
  };
}

/** Index i holds the minimum for length (MIN_LENGTH + i), in kobo. */
function buildSchedule(ladder: FundingLadder): number[] {
  const schedule: number[] = [Math.min(ladder.baseKobo, MAX_FUNDING_KOBO)];
  let kobo = ladder.baseKobo;
  for (let length = MIN_LENGTH + 1; length <= MAX_LENGTH; length++) {
    const steps = ladder.stepsKobo;
    const step = steps.length > 0
      ? steps[Math.min(length - MIN_LENGTH - 1, steps.length - 1)]
      : 0;
    kobo += step;
    schedule.push(Math.min(kobo, MAX_FUNDING_KOBO));
  }
  return schedule;
}

export function minFundingKobo(length: number, ladder: FundingLadder): number {
  const clamped = Math.min(Math.max(Math.trunc(length), MIN_LENGTH), MAX_LENGTH);
  return buildSchedule(ladder)[clamped - MIN_LENGTH];
}

/** The whole ladder, for the Build screen's "what does this cost?" table. */
export function fundingSchedule(
  ladder: FundingLadder
): { length: number; minFundingKobo: number }[] {
  return buildSchedule(ladder).map((minFundingKobo, i) => ({
    length: MIN_LENGTH + i,
    minFundingKobo,
  }));
}

/**
 * A contributor may always put up *more* than the minimum for a bigger
 * reward, but never more than the transfer cap.
 *
 * `floorKobo` is the floor already in force for this box, where there is one.
 * A draft written when the ladder was cheaper keeps the price it was quoted:
 * raising the ladder must not strand somebody mid-build, and it cannot be an
 * accidental loophole either, because a draft's own funding is the only thing
 * that can lower the bar and it can never be edited downwards past it.
 */
export function fundingIsValid(
  length: number,
  fundingKobo: number,
  ladder: FundingLadder,
  floorKobo?: number
): boolean {
  const floor = Math.min(minFundingKobo(length, ladder), floorKobo ?? Infinity);
  return (
    Number.isSafeInteger(fundingKobo) &&
    fundingKobo >= floor &&
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

/**
 * The 70/30 split on anything a *player* spends against a box — a power-up or
 * a life. Same direction of rounding as the funding split: the odd kobo goes
 * to the platform, so the two never disagree by a rounding rule.
 *
 * On the platform's own box there is nobody to pay, and the caller decides
 * that rather than this: it takes an amount, not a box.
 */
export function splitSale(
  kobo: number,
  /** What the platform keeps, if an admin has changed it. */
  platformSharePercent = PLATFORM_SHARE_PERCENT
): {
  contributorKobo: number;
  platformKobo: number;
} {
  const share = Math.max(0, Math.min(100, platformSharePercent));
  const platformKobo = Math.ceil((kobo * share) / 100);
  return { contributorKobo: kobo - platformKobo, platformKobo };
}

/** What a contributor keeps out of everything a player spends. 70. */
export const CONTRIBUTOR_SHARE_PERCENT = 100 - PLATFORM_SHARE_PERCENT;

/** ₦1,234,500 rather than 123450000. */
export function formatNaira(kobo: number): string {
  return `₦${Math.round(kobo / KOBO).toLocaleString("en-NG")}`;
}

/**
 * A naira field, as it is typed: digits only, no leading zeros, and hard
 * stopped at the ceiling.
 *
 * Clamping the *value* rather than the number of digits, because "10000001"
 * and "99999999" are both eight characters and only one of them is over the
 * line. Every money field on the site runs through this one function so that
 * the build screen, the admin's own box and the prize dialog cannot drift into
 * accepting three different things.
 */
export function capNaira(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  return String(Math.min(Number(digits), MAX_FUNDING_KOBO / KOBO));
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
