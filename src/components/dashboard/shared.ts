// Shared types + formatters for the dashboard components. Client-safe: no
// server-only imports here.

import type {
  CustomerSummary,
  GridStats,
  MerchantPlan,
  MerchantStats,
} from "@/lib/types";
import type { SubscriptionTier } from "@/lib/constants";

export interface Merchant {
  id: string;
  business_name: string;
  slug: string;
  subscription_tier: SubscriptionTier;
  premium_expires_at: string | null;
  logo_url: string | null;
  tagline: string | null;
  brand_color: string;
  points_per_discount: number;
  discount_percent: number;
  whatsapp: string | null;
  contact_email: string | null;
}

export interface UnlockRow {
  id: string;
  redemption_code: string;
  reward_type: string;
  discount_percent: number | null;
  status: string;
  unlocked_at: string;
  expires_at: string;
  // Computed at fetch time (render must stay pure, no Date.now() in JSX).
  isExpired: boolean;
  rewards: { description: string } | null;
  customers: { email: string } | null;
}

export interface Snapshot {
  merchant: Merchant | null;
  grids: GridStats[];
  unlocks: UnlockRow[];
  customers: CustomerSummary[];
  stats: MerchantStats | null;
  plan: MerchantPlan | null;
  hasReward: boolean;
  // Set when the merchant query itself failed (e.g. schema out of date) —
  // never show onboarding in that case, the merchant may well exist.
  loadError: string | null;
}

export interface RewardDraft {
  description: string;
  details: string;
  expiryDays: number;
  maxRedemptions: number;
}

// Yearly premium only counts while it hasn't lapsed (client-side mirror of
// the server's effectiveTier — lapsed merchants act as free).
export function isPremiumNow(merchant: Merchant): boolean {
  return (
    merchant.subscription_tier === "premium" &&
    merchant.premium_expires_at !== null &&
    new Date(merchant.premium_expires_at).getTime() > Date.now()
  );
}

export function effectiveTierNow(merchant: Merchant): SubscriptionTier {
  return isPremiumNow(merchant) ? "premium" : "free";
}

// "in 2d 4h" / "in 3h 20m" / "now" — for cooldowns and redemption ETAs.
export function formatEta(iso: string | null): string {
  if (!iso) return "now";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const totalMinutes = Math.ceil(ms / 60_000);
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

// "12 Aug 2026" — for the premium expiry and unlock dates.
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
