// Game constants. The Postgres functions in supabase/migrations mirror the
// cooldown and tier caps — change both places together.

export const COOLDOWN_HOURS = 10;

// Every grid is a fixed 7x7 board.
export const GRID_SIZE = 7;

// Loyalty exchange defaults for new merchants; each merchant can override
// points_per_discount / discount_percent from their dashboard.
export const DEFAULT_POINTS_PER_DISCOUNT = 3;
export const DEFAULT_DISCOUNT_PERCENT = 2;

// Loyalty points live 7 days from the last play (rolling window: playing
// again extends the whole balance).
export const POINTS_EXPIRY_DAYS = 7;

// Reward validity is configured in days on the dashboard.
export const REWARD_EXPIRY_DAYS_MIN = 1;
export const REWARD_EXPIRY_DAYS_MAX = 60;
export const REWARD_EXPIRY_DAYS_DEFAULT = 2;

// A completed grid rests before it auto-resets with fresh stock.
export const GRID_RESET_DAYS_DEFAULT = 7;

export const TIER_LIMITS = {
  free: { maxRewards: 2, maxActiveGrids: 1, resetDaysMin: 7, resetDaysMax: 7 },
  premium: {
    maxRewards: 10,
    maxActiveGrids: 10,
    resetDaysMin: 7,
    resetDaysMax: 365,
  },
} as const;

export type SubscriptionTier = keyof typeof TIER_LIMITS;

export const TILE_SHAPES = [
  "square",
  "interlock-sharp",
  "interlock-curved",
] as const;
export type TileShape = (typeof TILE_SHAPES)[number];

// Premium is a yearly plan: each payment buys 365 days.
export const PREMIUM_TERM_DAYS = 365;

// Fallback premium price if the app_settings row is missing (kobo, ₦5,000).
export const DEFAULT_PREMIUM_PRICE_KOBO = 500_000;

export const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export const HEX_COLOR_REGEX = /^#[0-9a-f]{6}$/;
export const PHONE_REGEX = /^[0-9+][0-9 ]{5,19}$/;

export const MAX_LOGO_BYTES = 1024 * 1024; // 1 MB
export const MAX_GRID_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB
export const LOGO_CONTENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
