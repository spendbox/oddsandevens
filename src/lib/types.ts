// Shapes returned by the Postgres game functions (jsonb) and the API routes.

export type RedeemResult =
  | {
      result: "redeemed";
      description: string;
      // Codes minted by the retired tile board are still redeemable, so the
      // old types stay readable even though nothing mints them now.
      reward_type: "tile" | "game" | "loyalty_discount";
      discount_percent: number | null;
      customer_email: string;
      unlocked_at: string;
    }
  | { result: "error"; error: "code_not_found" | "already_redeemed" | "expired" };

/** What the staff code box resolves to: a one-time code minted per prize. */
export type StaffLookupResult =
  | {
      result: "found";
      kind: "code";
      customer_email: string;
      description: string;
      status: "unredeemed" | "redeemed" | "expired";
      expires_at: string;
    }
  | { result: "error"; error: "code_not_found" | "merchant_not_found" };

export interface CustomerState {
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
  totalPlays: number;
  lastPlayedAt: string | null;
  /** Cooldown end, if the customer is currently in cooldown. */
  nextPlayAt: string | null;
  activeCodes: { description: string; expiresAt: string }[];
  totalUnlocks: number;
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
  revenue: LifeRevenue;
}

/**
 * Money from players buying extra plays. The business keeps the larger share
 * and the platform takes the rest; the split is done in `life_revenue` so
 * there is exactly one place that knows the rate.
 */
export interface LifeRevenue {
  grossKobo: number;
  businessKobo: number;
  platformKobo: number;
  business30dKobo: number;
  orders: number;
  livesSold: number;
  platformSharePercent: number;
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

/** A reusable reward in the merchant's catalogue (Build → Rewards). */
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

/** One business a customer has played, for the /me portal. */
export interface PlayerAccount {
  businessName: string;
  slug: string;
  logoUrl: string | null;
  brandColor: string;
  cooldownUntil: string | null;
  codes: {
    code: string;
    description: string;
    status: string;
    expiresAt: string;
  }[];
}
