// Game constants. The Postgres functions in supabase/migrations/0002_functions.sql
// bake in the same values — change both places together.

export const COOLDOWN_HOURS = 10;

export const POINTS_PER_DISCOUNT = 3;
export const DISCOUNT_PERCENT = 2;
export const DISCOUNT_CODE_EXPIRY_HOURS = 168;

export const TIER_LIMITS = {
  free: { minGrid: 5, maxGrid: 5, maxRewards: 1 },
  premium: { minGrid: 5, maxGrid: 20, maxRewards: 10 },
} as const;

export type SubscriptionTier = keyof typeof TIER_LIMITS;

export const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
