import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  COOLDOWN_HOURS,
  DEFAULT_DISCOUNT_PERCENT,
  EMAIL_REGEX,
} from "@/lib/constants";
import type { CustomerState } from "@/lib/types";

// Per-customer state for a merchant's grid: points balance, cooldown, and the
// customer's own unredeemed codes. Identified by email (v1 has no customer auth).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const email = (new URL(req.url).searchParams.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const empty: CustomerState = { loyaltyPoints: 0, cooldownUntil: null, codes: [] };

  const { data: merchant } = await db
    .from("merchants")
    .select("id")
    .eq("slug", slug.toLowerCase())
    .single();
  if (!merchant) {
    return NextResponse.json({ error: "merchant_not_found" }, { status: 404 });
  }

  const { data: customer } = await db
    .from("customers")
    .select("id")
    .eq("email", email)
    .single();
  if (!customer) return NextResponse.json(empty);

  const [{ data: state }, { data: codes }] = await Promise.all([
    db
      .from("customer_merchant_state")
      .select("last_played_at, loyalty_points")
      .eq("customer_id", customer.id)
      .eq("merchant_id", merchant.id)
      .single(),
    db
      .from("unlocked_rewards")
      .select(
        "redemption_code, reward_type, discount_percent, status, expires_at, rewards(description)"
      )
      .eq("customer_id", customer.id)
      .eq("merchant_id", merchant.id)
      .eq("status", "unredeemed")
      .gt("expires_at", new Date().toISOString())
      .order("unlocked_at", { ascending: false }),
  ]);

  let cooldownUntil: string | null = null;
  if (state?.last_played_at) {
    const until = new Date(
      new Date(state.last_played_at).getTime() + COOLDOWN_HOURS * 3600 * 1000
    );
    if (until.getTime() > Date.now()) cooldownUntil = until.toISOString();
  }

  const result: CustomerState = {
    loyaltyPoints: state?.loyalty_points ?? 0,
    cooldownUntil,
    codes: (codes ?? []).map((c) => ({
      code: c.redemption_code,
      description:
        c.reward_type === "loyalty_discount"
          ? `${c.discount_percent ?? DEFAULT_DISCOUNT_PERCENT}% loyalty discount`
          : ((c.rewards as unknown as { description: string } | null)
              ?.description ?? "Tile reward"),
      status: c.status,
      expiresAt: c.expires_at,
    })),
  };
  return NextResponse.json(result);
}
