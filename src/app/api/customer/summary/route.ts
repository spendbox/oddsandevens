import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { COOLDOWN_HOURS, EMAIL_REGEX } from "@/lib/constants";
import type { LoyaltyAccount } from "@/lib/types";

// The customer portal (/me): every business this email plays with, points,
// and active codes. Same email-only trust model as the per-merchant /me
// endpoint — the email is the credential (v1 has no customer auth).
export async function GET(req: Request) {
  const email = (new URL(req.url).searchParams.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: customer } = await db
    .from("customers")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!customer) return NextResponse.json({ accounts: [] });

  const [{ data: states }, { data: unlocks }] = await Promise.all([
    db
      .from("customer_merchant_state")
      .select(
        "merchant_id, last_played_at, loyalty_points, merchants(business_name, slug, logo_url, brand_color, points_per_discount, discount_percent)"
      )
      .eq("customer_id", customer.id),
    db
      .from("unlocked_rewards")
      .select(
        "merchant_id, redemption_code, reward_type, discount_percent, status, expires_at, rewards(description)"
      )
      .eq("customer_id", customer.id)
      .eq("status", "unredeemed")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true }),
  ]);

  const codesByMerchant = new Map<string, LoyaltyAccount["codes"]>();
  for (const u of unlocks ?? []) {
    const list = codesByMerchant.get(u.merchant_id) ?? [];
    list.push({
      code: u.redemption_code,
      description:
        u.reward_type === "loyalty_discount"
          ? `${u.discount_percent}% loyalty discount`
          : ((u.rewards as unknown as { description: string } | null)
              ?.description ?? "Tile reward"),
      status: u.status,
      expiresAt: u.expires_at,
    });
    codesByMerchant.set(u.merchant_id, list);
  }

  const now = Date.now();
  const accounts: LoyaltyAccount[] = (states ?? [])
    .map((s) => {
      const m = s.merchants as unknown as {
        business_name: string;
        slug: string;
        logo_url: string | null;
        brand_color: string;
        points_per_discount: number;
        discount_percent: number;
      } | null;
      if (!m) return null;
      let cooldownUntil: string | null = null;
      if (s.last_played_at) {
        const until =
          new Date(s.last_played_at).getTime() + COOLDOWN_HOURS * 3600 * 1000;
        if (until > now) cooldownUntil = new Date(until).toISOString();
      }
      return {
        businessName: m.business_name,
        slug: m.slug,
        logoUrl: m.logo_url,
        brandColor: m.brand_color,
        loyaltyPoints: s.loyalty_points,
        pointsPerDiscount: m.points_per_discount,
        discountPercent: m.discount_percent,
        cooldownUntil,
        codes: codesByMerchant.get(s.merchant_id) ?? [],
      };
    })
    .filter((a): a is LoyaltyAccount => a !== null)
    .sort((a, b) => b.loyaltyPoints - a.loyaltyPoints);

  return NextResponse.json({ accounts });
}
