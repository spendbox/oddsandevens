// The streak ladder, as the browser needs to read it.
//
// The ladder itself lives in `platform_settings` and is served by the API, so
// nothing here is a second copy of the rewards. What is here is the one thing
// SQL should not decide: how to *say* a grant in a sentence somebody wants to
// read. "free_lives 25" is a row; "25 lives" is a reward.

import { POWER_UPS, isPowerUpKind } from "@/lib/game/power-ups";

export const STREAK_DAYS = 30;

/** Days that end a week, and get the full-screen treatment. */
export const MILESTONES = [7, 14, 21, 28, 30];

export type GrantKind =
  | "free_lives"
  | "life_discount"
  | "power_up_discount"
  | "free_second_wind"
  | "free_power_up"
  | "life_bank";

export interface Grant {
  kind: GrantKind;
  amount?: number;
  powerUp?: string;
}

export interface StreakDay {
  day: number;
  grants: Grant[];
}

export interface StreakState {
  enabled: boolean;
  day: number;
  cycle: number;
  bestDay: number;
  claimedToday: boolean;
  claimable: boolean;
  nextDay: number;
  broke: boolean;
  ladder: StreakDay[];
}

function powerUpName(kind: string | undefined): string {
  return kind && isPowerUpKind(kind) ? POWER_UPS[kind].name : "a power-up";
}

/** One grant, short enough for a tile. */
export function grantLabel(grant: Grant): string {
  switch (grant.kind) {
    case "free_lives":
      return `${grant.amount ?? 0} lives`;
    case "life_bank":
      return `${grant.amount ?? 0}d Life Bank`;
    case "life_discount":
      return `${grant.amount ?? 0}% off lives`;
    case "power_up_discount":
      return `${grant.amount ?? 0}% off ${powerUpName(grant.powerUp)}`;
    case "free_second_wind":
      return "Second Wind";
    case "free_power_up":
      return `Free ${powerUpName(grant.powerUp)}`;
    default:
      return "A reward";
  }
}

/** The whole day, for the line under the number. */
export function dayLabel(day: StreakDay | undefined): string {
  if (!day || day.grants.length === 0) return "—";
  return day.grants.map(grantLabel).join(" + ");
}

/**
 * The one grant a tile leads with.
 *
 * A milestone gives three things and a tile is 64px. Ordering by what somebody
 * would tell a friend about — headroom, then information, then a discount,
 * then lives — is what keeps "14d Life Bank" on the tile rather than the 25
 * lives that came with it.
 */
const WEIGHT: Record<GrantKind, number> = {
  life_bank: 5,
  free_power_up: 4,
  free_second_wind: 3,
  power_up_discount: 2,
  life_discount: 1,
  free_lives: 0,
};

export function headlineGrant(day: StreakDay | undefined): Grant | null {
  if (!day || day.grants.length === 0) return null;
  return [...day.grants].sort((a, b) => (WEIGHT[b.kind] ?? 0) - (WEIGHT[a.kind] ?? 0))[0];
}

/** Whether a day is worth the full-screen moment. */
export function isMilestone(day: number): boolean {
  return MILESTONES.includes(day);
}

// ---------------------------------------------------------------------------
// Where a claimed reward is actually spent
// ---------------------------------------------------------------------------

/**
 * The control that lights up after a claim.
 *
 * "Go and spend it" was the whole of the guidance, and it named neither the
 * thing nor the place: a 30% discount on a Breakdown is spent on the power-up
 * shelf, inside a safe, which is two taps and a screen away from the dialog
 * that announced it. A reward nobody can find is a reward nobody takes.
 */
export type SpendTarget = "lives" | "power-ups";

export interface SpendGuide {
  /** Which control glows, or null when there is nothing to go and do. */
  target: SpendTarget | null;
  /** Where it is spent, in one line, addressed to the player. */
  where: string;
  /** What the button that closes the dialog should say. */
  cta: string;
}

/**
 * Which till a grant is spent at.
 *
 * Lives and Life Bank are not here because they are not spent at a till at
 * all: both land in the pool at the moment of claiming, and the only thing
 * left to do with them is play.
 */
const SPENDS_AT: Record<GrantKind, SpendTarget | null> = {
  power_up_discount: "power-ups",
  free_power_up: "power-ups",
  free_second_wind: "power-ups",
  life_discount: "lives",
  free_lives: null,
  life_bank: null,
};

/**
 * What to tell somebody who has just claimed, and what to light up.
 *
 * A milestone hands over three things at once and they are not spent in the
 * same place, so one of them has to lead. The shelf wins over the lives
 * counter for the same reason `WEIGHT` orders the tiles: a free X-Ray is the
 * part somebody would go out of their way for, and a discount on lives is
 * still there afterwards. Where nothing needs spending the guidance says so
 * rather than sending them looking for a till that has nothing for them.
 */
export function spendGuide(grants: Grant[]): SpendGuide {
  const targets = new Set(grants.map((g) => SPENDS_AT[g.kind]));

  if (targets.has("power-ups")) {
    const free = grants.find((g) => g.kind === "free_power_up" || g.kind === "free_second_wind");
    return {
      target: "power-ups",
      where: free
        ? "Open any safe and take it from the Power-ups shelf."
        : "Open any safe — the discount is on the Power-ups shelf.",
      cta: "Show me where",
    };
  }

  if (targets.has("lives")) {
    return {
      target: "lives",
      where: "Tap your lives, up in the corner, to spend it before it expires.",
      cta: "Show me where",
    };
  }

  // Nothing to find, so nothing is promised: this one is already done, and
  // saying which way it is done is more use than sending them looking.
  const lives = grants.some((g) => g.kind === "free_lives");
  const headroom = grants.some((g) => g.kind === "life_bank");
  return {
    target: null,
    where:
      lives && headroom
        ? "Already yours — the lives are in your pool, and it holds more of them now."
        : lives
          ? "They're in your pool already. Go and spend them on a password."
          : headroom
            ? "Your pool holds more now. Nothing to collect — go and fill it."
            : "Nothing to collect. Go and spend a life on a password.",
    cta: "Back to the hunt",
  };
}
