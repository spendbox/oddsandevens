// Shapes returned by the Postgres game functions (jsonb) and the API routes.

import type { TileShape } from "./constants";

export type PlayResult =
  | { result: "hit"; description: string; code: string; expires_at: string }
  | { result: "miss"; loyalty_points: number }
  | { result: "cooldown"; next_play_at: string; loyalty_points: number }
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

export type PointsRedeemResult =
  | {
      result: "discount_issued";
      discount_percent: number;
      code: string;
      expires_at: string;
      loyalty_points: number;
    }
  | { result: "error"; error: "merchant_not_found" | "insufficient_points" };

export type CreateGridResult =
  | { result: "created"; grid_id: string }
  | {
      result: "error";
      error:
        | "merchant_not_found"
        | "grid_size_not_allowed"
        | "too_many_rewards"
        | "no_rewards"
        | "rewards_exceed_tiles"
        | "invalid_tile_shape"
        | "shape_requires_premium"
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
  cooldownUntil: string | null;
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
  pointsPerDiscount: number;
  discountPercent: number;
  cooldownUntil: string | null;
  codes: {
    code: string;
    description: string;
    status: string;
    expiresAt: string;
  }[];
}
