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
  | {
      result: "no_plays";
      loyalty_points: number;
      points_expire_at: string | null;
    }
  | { result: "error"; error: PlayError };

export type PlayError =
  | "invalid_email"
  | "merchant_not_found"
  | "no_active_grid"
  | "invalid_tile"
  | "tile_taken"
  | "email_not_verified";

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

// What the staff code box resolves to: the customer's cycling loyalty code
// or a one-time redemption code minted per unlock.
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
      kind: "code";
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
        | "too_many_active_grids"
        | "title_required";
    };

// One active grid as served to the play page. Contains no reward positions —
// only what has already been revealed.
export interface PublicGrid {
  id: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  tileShape: TileShape;
  rows: number;
  cols: number;
  revealed: { row: number; col: number; hit: boolean }[];
  rewardsRemaining: number;
  // What's hidden in this grid, for the welcome popup and the rewards strip
  // under the board (no positions).
  rewardsInfo: { description: string; details: string | null; icon: string | null }[];
  // Latest taps on this grid (current cycle), newest first, emails masked —
  // shown as a live-activity ticker on the play page.
  recentActivity: {
    maskedEmail: string;
    hit: boolean;
    description: string | null;
    at: string;
  }[];
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
  // Cycling per-business loyalty code shown at the counter.
  loyaltyCode: string | null;
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

// Plays-based plan state for the dashboard (from /api/merchant/plan).
export interface MerchantPlan {
  tier: "free" | "premium";
  premiumExpiresAt: string | null;
  baseAllowance: number; // annual plays for the current tier
  premiumYearlyPlays: number; // annual plays a premium plan grants (for the upsell)
  playsUsed: number; // plays used this annual period
  baseRemaining: number; // baseAllowance - playsUsed, floored at 0
  topupPlays: number; // purchased, non-expiring plays
  playsRemaining: number; // baseRemaining + topupPlays
  periodEnd: string; // when the annual window resets
  premiumPriceKobo: number;
  topupPricePer1000Kobo: number;
  paymentsEnabled: boolean;
}

// A reusable reward in the merchant's catalogue (Build → Rewards). Copied into
// grid-bound rewards when a grid is built.
export interface RewardTemplate {
  id: string;
  description: string;
  details: string | null;
  icon: string | null;
  default_expiry_days: number;
  created_at: string;
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
  codes: {
    code: string;
    description: string;
    status: string;
    expiresAt: string;
  }[];
}
