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
