// Game constants. The Postgres functions in supabase/migrations mirror the
// cooldown and tier caps — change both places together.

export const COOLDOWN_HOURS = 10;

// Loyalty exchange defaults for new merchants; each merchant can override
// points_per_discount / discount_percent from their dashboard.
export const DEFAULT_POINTS_PER_DISCOUNT = 3;
export const DEFAULT_DISCOUNT_PERCENT = 2;
export const DISCOUNT_CODE_EXPIRY_HOURS = 168;

export const TIER_LIMITS = {
  free: { minGrid: 5, maxGrid: 5, maxRewards: 2 },
  premium: { minGrid: 5, maxGrid: 20, maxRewards: 10 },
} as const;

export type SubscriptionTier = keyof typeof TIER_LIMITS;

export const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export const HEX_COLOR_REGEX = /^#[0-9a-f]{6}$/;

export const MAX_LOGO_BYTES = 1024 * 1024; // 1 MB
export const LOGO_CONTENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
