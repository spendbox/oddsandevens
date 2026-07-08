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
export const REWARD_EXPIRY_DAYS_DEFAULT = 30;

// A completed grid rests before it auto-resets with fresh stock.
export const GRID_RESET_DAYS_DEFAULT = 7;

export const TIER_LIMITS = {
  free: { maxRewards: 2, maxActiveGrids: 1, resetDaysMin: 7, resetDaysMax: 7 },
  premium: {
    maxRewards: 10,
    // Premium runs unlimited grids — grids can model whole product lines.
    maxActiveGrids: Number.POSITIVE_INFINITY,
    resetDaysMin: 7,
    resetDaysMax: 365,
  },
} as const;

export type SubscriptionTier = keyof typeof TIER_LIMITS;

export const TILE_SHAPES = [
  "square",
  "interlock-sharp",
  "interlock-curved",
  "interlock-round",
  "interlock-chevron",
] as const;
export type TileShape = (typeof TILE_SHAPES)[number];

// Premium is a yearly plan: each payment buys 365 days.
export const PREMIUM_TERM_DAYS = 365;

// Fallback premium price if the app_settings row is missing (kobo, ₦5,000).
export const DEFAULT_PREMIUM_PRICE_KOBO = 500_000;

// Plays-based allowances. A "play" is one tile tap that actually consumes a
// tile (a hit or a miss); cooldown/taken/invalid taps don't count. Each
// merchant gets an annual base allowance by tier (below, admin-tunable), plus
// any purchased top-up plays that don't expire. When both run out, play pauses.
export const PLAYS_PERIOD_DAYS = 365;
export const DEFAULT_FREE_YEARLY_PLAYS = 100;
export const DEFAULT_PREMIUM_YEARLY_PLAYS = 5000;
// Top-ups are priced per 1,000 plays; the business buys any custom quantity.
export const DEFAULT_TOPUP_PRICE_PER_1000_KOBO = 100_000; // ₦1,000 / 1,000 plays
export const TOPUP_MIN_PLAYS = 100;
export const TOPUP_MAX_PLAYS = 1_000_000;

// Grid descriptions are optional, customer-facing, and capped like details.
export const GRID_DESCRIPTION_MAX = 300;

// Icon slugs a business can attach to a reward (see lib/reward-icons.tsx for
// the component map). Stored in rewards.icon / reward_templates.icon.
export const REWARD_ICON_SLUGS = [
  "gift",
  "percent",
  "ticket",
  "star",
  "sparkles",
  "heart",
  "gem",
  "coffee",
  "pizza",
  "sandwich",
  "croissant",
  "salad",
  "drumstick",
  "ice-cream",
  "cake",
  "drink",
  "beer",
  "utensils",
  "shirt",
  "bag",
  "scissors",
  "music",
  "car",
  "dumbbell",
  "phone",
] as const;
export type RewardIconSlug = (typeof REWARD_ICON_SLUGS)[number];

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
