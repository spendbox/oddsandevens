import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { effectiveTier, getAuthedMerchant } from "@/lib/merchant-auth";
import { paystackConfigured } from "@/lib/paystack";
import {
  DEFAULT_FREE_YEARLY_PLAYS,
  DEFAULT_PREMIUM_PRICE_KOBO,
  DEFAULT_PREMIUM_YEARLY_PLAYS,
  DEFAULT_TOPUP_PRICE_PER_1000_KOBO,
  PLAYS_PERIOD_DAYS,
} from "@/lib/constants";
import type { MerchantPlan } from "@/lib/types";

// Everything the dashboard needs to show play balances and the Plans section:
// the annual allowance for the merchant's tier, plays used this period,
// non-expiring top-up plays, when the window resets, and current pricing.
export async function GET() {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const { data: settingsRows } = await db
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "free_yearly_plays",
      "premium_yearly_plays",
      "premium_price_kobo",
      "topup_price_per_1000_kobo",
    ]);
  const settings = new Map(
    (settingsRows ?? []).map((r) => [r.key, Number(r.value)])
  );

  const tier = effectiveTier(merchant);
  const premiumYearlyPlays =
    settings.get("premium_yearly_plays") ?? DEFAULT_PREMIUM_YEARLY_PLAYS;
  const baseAllowance =
    tier === "premium"
      ? premiumYearlyPlays
      : settings.get("free_yearly_plays") ?? DEFAULT_FREE_YEARLY_PLAYS;

  // Mirror play_tile's lazy annual rollover so the dashboard shows the same
  // numbers the customer page will enforce.
  const periodStart = new Date(merchant.plays_period_start).getTime();
  const periodEnd = periodStart + PLAYS_PERIOD_DAYS * 86400_000;
  const rolledOver = Date.now() >= periodEnd;
  const playsUsed = rolledOver ? 0 : merchant.plays_used;
  const effectivePeriodEnd = rolledOver
    ? Date.now() + PLAYS_PERIOD_DAYS * 86400_000
    : periodEnd;

  const baseRemaining = Math.max(0, baseAllowance - playsUsed);

  const plan: MerchantPlan = {
    tier,
    premiumExpiresAt: merchant.premium_expires_at,
    baseAllowance,
    premiumYearlyPlays,
    playsUsed,
    baseRemaining,
    topupPlays: merchant.topup_plays,
    playsRemaining: baseRemaining + merchant.topup_plays,
    periodEnd: new Date(effectivePeriodEnd).toISOString(),
    premiumPriceKobo:
      settings.get("premium_price_kobo") ?? DEFAULT_PREMIUM_PRICE_KOBO,
    topupPricePer1000Kobo:
      settings.get("topup_price_per_1000_kobo") ??
      DEFAULT_TOPUP_PRICE_PER_1000_KOBO,
    paymentsEnabled: paystackConfigured(),
  };
  return NextResponse.json(plan);
}
