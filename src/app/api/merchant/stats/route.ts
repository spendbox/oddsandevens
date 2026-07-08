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
  const [{ data: states }, { data: unlocks }] = await Promise.all([
    db
      .from("customer_merchant_state")
      .select("loyalty_points, points_expire_at, total_plays")
      .eq("merchant_id", merchant.id),
    db
      .from("unlocked_rewards")
      .select("reward_type, status, redeemed_at, expires_at")
      .eq("merchant_id", merchant.id),
  ]);

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86400_000;

  let totalPlays = 0;
  let pointsOutstanding = 0;
  for (const s of states ?? []) {
    totalPlays += s.total_plays ?? 0;
    // Balances count while unexpired (null expiry = legacy balance, still live).
    const expired =
      s.points_expire_at != null &&
      new Date(s.points_expire_at).getTime() <= now;
    if (!expired) pointsOutstanding += s.loyalty_points;
  }

  let rewardsUnlocked = 0;
  let redemptions = 0;
  let redemptionsLast30d = 0;
  let activeCodes = 0;
  for (const u of unlocks ?? []) {
    if (u.reward_type === "tile") rewardsUnlocked += 1;
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
  const stats: MerchantStats = {
    totalCustomers: (states ?? []).length,
    totalPlays,
    rewardsUnlocked,
    redemptions,
    redemptionsLast30d,
    redemptionRate: totalIssued > 0 ? redemptions / totalIssued : 0,
    activeCodes,
    pointsOutstanding,
  };
  return NextResponse.json(stats);
}
