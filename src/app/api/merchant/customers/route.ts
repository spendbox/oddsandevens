import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import { COOLDOWN_HOURS } from "@/lib/constants";
import type { CustomerSummary } from "@/lib/types";

// Participating customers for the dashboard: everyone who has played this
// merchant's grid, with points, active codes, and how far they are from a
// loyalty discount. customer_merchant_state has no client RLS policy, so this
// goes through the service role.
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
      .select("customer_id, last_played_at, loyalty_points, customers(email)")
      .eq("merchant_id", merchant.id)
      .order("last_played_at", { ascending: false })
      .limit(200),
    db
      .from("unlocked_rewards")
      .select(
        "customer_id, reward_type, discount_percent, status, expires_at, rewards(description)"
      )
      .eq("merchant_id", merchant.id),
  ]);

  const now = Date.now();
  const cooldownMs = COOLDOWN_HOURS * 3600 * 1000;

  const unlocksByCustomer = new Map<
    string,
    { active: { description: string; expiresAt: string }[]; total: number }
  >();
  for (const u of unlocks ?? []) {
    let entry = unlocksByCustomer.get(u.customer_id);
    if (!entry) {
      entry = { active: [], total: 0 };
      unlocksByCustomer.set(u.customer_id, entry);
    }
    entry.total += 1;
    if (u.status === "unredeemed" && new Date(u.expires_at).getTime() > now) {
      entry.active.push({
        description:
          u.reward_type === "loyalty_discount"
            ? `${u.discount_percent}% loyalty discount`
            : ((u.rewards as unknown as { description: string } | null)
                ?.description ?? "Tile reward"),
        expiresAt: u.expires_at,
      });
    }
  }

  const customers: CustomerSummary[] = (states ?? []).map((s) => {
    const lastPlayed = s.last_played_at ? new Date(s.last_played_at).getTime() : null;
    const cooldownEnd = lastPlayed ? lastPlayed + cooldownMs : null;
    const nextPlayAt =
      cooldownEnd && cooldownEnd > now ? new Date(cooldownEnd).toISOString() : null;

    // One loyalty point per play, one play per cooldown window: the soonest a
    // customer can afford a discount is pointsToDiscount plays from now.
    const pointsToDiscount = Math.max(
      merchant.points_per_discount - s.loyalty_points,
      0
    );
    let discountReadyAt: string | null = null;
    if (pointsToDiscount > 0) {
      const start = cooldownEnd && cooldownEnd > now ? cooldownEnd : now;
      discountReadyAt = new Date(
        start + (pointsToDiscount - 1) * cooldownMs
      ).toISOString();
    }

    const entry = unlocksByCustomer.get(s.customer_id);
    return {
      email:
        (s.customers as unknown as { email: string } | null)?.email ?? "—",
      loyaltyPoints: s.loyalty_points,
      lastPlayedAt: s.last_played_at,
      nextPlayAt,
      pointsToDiscount,
      discountReadyAt,
      activeCodes: entry?.active ?? [],
      totalUnlocks: entry?.total ?? 0,
    };
  });

  return NextResponse.json({ customers });
}
