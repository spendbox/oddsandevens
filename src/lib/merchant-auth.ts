import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import type { SubscriptionTier } from "@/lib/constants";

export interface MerchantRow {
  id: string;
  owner_id: string;
  business_name: string;
  slug: string;
  subscription_tier: "free" | "premium";
  premium_expires_at: string | null;
  logo_url: string | null;
  tagline: string | null;
  brand_color: string;
  points_per_discount: number;
  discount_percent: number;
  whatsapp: string | null;
  contact_email: string | null;
  plays_used: number;
  plays_period_start: string;
  topup_plays: number;
}

// Premium is a yearly plan: the tier only counts while it hasn't lapsed.
// Lapsed merchants act as free for new actions (existing grids keep playing).
export function isPremium(merchant: {
  subscription_tier: string;
  premium_expires_at: string | null;
}): boolean {
  return (
    merchant.subscription_tier === "premium" &&
    merchant.premium_expires_at !== null &&
    new Date(merchant.premium_expires_at).getTime() > Date.now()
  );
}

export function effectiveTier(merchant: {
  subscription_tier: string;
  premium_expires_at: string | null;
}): SubscriptionTier {
  return isPremium(merchant) ? "premium" : "free";
}

// Resolves the logged-in merchant for /api/merchant/* routes. Auth comes from
// the session cookie; the merchant row is fetched with the service role so the
// route can act on it afterwards.
export async function getAuthedMerchant(): Promise<
  | { userId: string; merchant: MerchantRow | null }
  | { userId: null; merchant: null }
> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, merchant: null };

  const { data: merchant } = await supabaseAdmin()
    .from("merchants")
    .select(
      "id, owner_id, business_name, slug, subscription_tier, premium_expires_at, logo_url, tagline, brand_color, points_per_discount, discount_percent, whatsapp, contact_email, plays_used, plays_period_start, topup_plays"
    )
    .eq("owner_id", user.id)
    .maybeSingle();

  return { userId: user.id, merchant: (merchant as MerchantRow | null) ?? null };
}
