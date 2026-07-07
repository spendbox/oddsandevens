// Shapes returned by the Postgres game functions (jsonb) and the API routes.

import type { TileShape } from "./constants";

export type PlayResult =
  | {
      result: "hit";
      description: string;
      code: string;
      expires_at: string;
      grid_completed?: boolean;
      resets_at?: string;
    }
  | {
      result: "miss";
      loyalty_points: number;
      points_expire_at: string | null;
      grid_completed?: boolean;
      resets_at?: string;
    }
  | {
      result: "cooldown";
      next_play_at: string;
      loyalty_points: number;
      points_expire_at: string | null;
    }
  | { result: "grid_completed"; resets_at: string }
  | { result: "error"; error: PlayError };

export type PlayError =
  | "invalid_email"
  | "merchant_not_found"
  | "no_active_grid"
  | "invalid_tile"
  | "tile_taken";

export type RedeemResult =
  | {
      result: "redeemed";
      description: string;
      reward_type: "tile" | "loyalty_discount";
      discount_percent: number | null;
      customer_email: string;
      unlocked_at: string;
    }
  | { result: "error"; error: "code_not_found" | "already_redeemed" | "expired" };

// One entry in a reward-code lookup: an unlocked reward the staff can redeem.
export interface StaffRewardEntry {
  unlocked_id: string;
  description: string;
  reward_type: "tile" | "loyalty_discount";
  discount_percent: number | null;
  unlocked_at: string;
  expires_at: string;
}

// What the staff code box resolves to: the customer's cycling loyalty code,
// their fixed reward code, or a legacy one-time redemption code.
export type StaffLookupResult =
  | {
      result: "found";
      kind: "loyalty";
      customer_email: string;
      points: number;
      points_needed: number;
      discount_percent: number;
      eligible: boolean;
      points_expire_at: string | null;
    }
  | {
      result: "found";
      kind: "reward";
      customer_email: string;
      rewards: StaffRewardEntry[];
    }
  | {
      result: "found";
      kind: "legacy";
      customer_email: string;
      description: string;
      status: "unredeemed" | "redeemed" | "expired";
      expires_at: string;
    }
  | { result: "error"; error: "code_not_found" | "merchant_not_found" };

export type LoyaltyRedeemResult =
  | {
      result: "loyalty_redeemed";
      discount_percent: number;
      customer_email: string;
      points_remaining: number;
      points_expire_at: string | null;
    }
  | {
      result: "error";
      error: "code_not_found" | "merchant_not_found" | "insufficient_points";
      points?: number;
      points_needed?: number;
    };

export type CreateGridResult =
  | { result: "created"; grid_id: string }
  | {
      result: "error";
      error:
        | "merchant_not_found"
        | "too_many_rewards"
        | "no_rewards"
        | "rewards_exceed_tiles"
        | "invalid_tile_shape"
        | "shape_requires_premium"
        | "invalid_reset_days"
        | "too_many_active_grids";
    };

// One active grid as served to the play page. Contains no reward positions —
// only what has already been revealed.
export interface PublicGrid {
  id: string;
  title: string | null;
  imageUrl: string | null;
  tileShape: TileShape;
  rows: number;
  cols: number;
  revealed: { row: number; col: number; hit: boolean }[];
  rewardsRemaining: number;
  // Set while the grid rests after completion; resetsAt is when it revives.
  completedAt: string | null;
  resetsAt: string | null;
}

// The whole board page: merchant branding + every active grid.
export interface PublicBoardState {
  businessName: string;
  logoUrl: string | null;
  tagline: string | null;
  brandColor: string;
  whatsapp: string | null;
  contactEmail: string | null;
  pointsPerDiscount: number;
  discountPercent: number;
  grids: PublicGrid[];
}

export interface CustomerState {
  loyaltyPoints: number;
  pointsExpireAt: string | null;
  cooldownUntil: string | null;
  // Persistent per-business codes shown at the counter.
  loyaltyCode: string | null;
  rewardCode: string | null;
  codes: {
    code: string;
    description: string;
    status: string;
    expiresAt: string;
  }[];
}

// Per-customer summary for the merchant dashboard's customers list.
export interface CustomerSummary {
  email: string;
  loyaltyPoints: number;
  pointsExpireAt: string | null;
  totalPlays: number;
  lastPlayedAt: string | null;
  // Cooldown end, if the customer is currently in cooldown.
  nextPlayAt: string | null;
  // Points still missing for a loyalty discount, and the soonest wall-clock
  // time they could have them (one point per play, one play per cooldown).
  pointsToDiscount: number;
  discountReadyAt: string | null;
  activeCodes: { description: string; expiresAt: string }[];
  totalUnlocks: number;
}

// A grid with lifetime stats, for the merchant's grids manager.
export interface GridStats {
  id: string;
  title: string | null;
  imageUrl: string | null;
  tileShape: TileShape;
  rows: number;
  cols: number;
  status: "active" | "archived";
  createdAt: string;
  tileCount: number;
  revealedCount: number;
  unlockedCount: number;
  redeemedCount: number;
  resetDays: number;
  completedAt: string | null;
  cycle: number;
}

// Aggregate KPIs for the dashboard's stats row.
export interface MerchantStats {
  totalCustomers: number;
  totalPlays: number;
  rewardsUnlocked: number;
  redemptions: number;
  redemptionsLast30d: number;
  redemptionRate: number; // redemptions / all codes issued, 0..1
  activeCodes: number;
  pointsOutstanding: number;
}

// Free image library entry (curated in /admin).
export interface LibraryImage {
  id: string;
  title: string;
  url: string;
}

// One business a customer is loyal to, for the /me customer portal.
export interface LoyaltyAccount {
  businessName: string;
  slug: string;
  logoUrl: string | null;
  brandColor: string;
  loyaltyPoints: number;
  pointsExpireAt: string | null;
  pointsPerDiscount: number;
  discountPercent: number;
  cooldownUntil: string | null;
  loyaltyCode: string | null;
  rewardCode: string | null;
  codes: {
    code: string;
    description: string;
    status: string;
    expiresAt: string;
  }[];
}
