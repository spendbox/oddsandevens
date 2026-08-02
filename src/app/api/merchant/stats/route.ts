import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import type { MerchantStats } from "@/lib/types";

// Aggregate KPIs for the dashboard's stats row. Aggregated in JS like the
// rest of the merchant routes — row counts here are bounded by real-world
// customer traffic per merchant.
export async function GET() {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const [{ data: states }, { data: unlocks }, { data: revenue }] =
    await Promise.all([
      db
        .from("customer_merchant_state")
        .select("total_plays")
        .eq("merchant_id", merchant.id),
      db
        .from("unlocked_rewards")
        .select("reward_type, status, redeemed_at, expires_at")
        .eq("merchant_id", merchant.id),
      db.rpc("life_revenue", { p_merchant_id: merchant.id }),
    ]);

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86400_000;

  let totalPlays = 0;
  for (const s of states ?? []) {
    totalPlays += s.total_plays ?? 0;
  }

  let rewardsUnlocked = 0;
  let redemptions = 0;
  let redemptionsLast30d = 0;
  let activeCodes = 0;
  for (const u of unlocks ?? []) {
    // Every code issued is a prize won, whichever product minted it.
    rewardsUnlocked += 1;
    if (u.status === "redeemed") {
      redemptions += 1;
      if (u.redeemed_at && new Date(u.redeemed_at).getTime() >= thirtyDaysAgo) {
        redemptionsLast30d += 1;
      }
    }
    if (
      u.status === "unredeemed" &&
      new Date(u.expires_at).getTime() > now
    ) {
      activeCodes += 1;
    }
  }

  const totalIssued = (unlocks ?? []).length;
  const money = (revenue ?? {}) as Record<string, number>;
  const stats: MerchantStats = {
    totalCustomers: (states ?? []).length,
    totalPlays,
    rewardsUnlocked,
    redemptions,
    redemptionsLast30d,
    redemptionRate: totalIssued > 0 ? redemptions / totalIssued : 0,
    activeCodes,
    // What players have paid this business for extra plays. `life_revenue`
    // does the split, so the dashboard never has to know the rate.
    revenue: {
      grossKobo: Number(money.gross_kobo ?? 0),
      businessKobo: Number(money.business_kobo ?? 0),
      platformKobo: Number(money.platform_kobo ?? 0),
      business30dKobo: Number(money.business_30d_kobo ?? 0),
      orders: Number(money.orders ?? 0),
      livesSold: Number(money.lives_sold ?? 0),
      platformSharePercent: Number(money.platform_share_percent ?? 30),
    },
  };
  return NextResponse.json(stats);
}
