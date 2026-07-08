import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  COOLDOWN_HOURS,
  DEFAULT_DISCOUNT_PERCENT,
  EMAIL_REGEX,
} from "@/lib/constants";
import { clientIpHash } from "@/lib/ip";
import type { CustomerState } from "@/lib/types";

// Per-customer state for a merchant's grid: points balance (with its rolling
// expiry), cooldown, the customer's persistent counter codes, and their
// unredeemed one-time codes. Identified by email (v1 has no customer auth).
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
  const empty: CustomerState = {
    loyaltyPoints: 0,
    pointsExpireAt: null,
    cooldownUntil: null,
    loyaltyCode: null,
    codes: [],
  };

  const { data: merchant } = await db
    .from("merchants")
    .select("id")
    .eq("slug", slug.toLowerCase())
    .single();
  if (!merchant) {
    return NextResponse.json({ error: "merchant_not_found" }, { status: 404 });
  }

  const ipHash = clientIpHash(req);
  const { data: customer } = await db
    .from("customers")
    .select("id")
    .eq("email", email)
    .single();

  // The IP cooldown applies even before this email has ever played.
  const { data: ipState } = ipHash
    ? await db
        .from("play_ip_state")
        .select("last_played_at")
        .eq("merchant_id", merchant.id)
        .eq("ip_hash", ipHash)
        .maybeSingle()
    : { data: null };

  const cooldownFrom = (lastPlayedAt: string | null | undefined) => {
    if (!lastPlayedAt) return null;
    const until = new Date(
      new Date(lastPlayedAt).getTime() + COOLDOWN_HOURS * 3600 * 1000
    );
    return until.getTime() > Date.now() ? until : null;
  };

  const ipCooldown = cooldownFrom(ipState?.last_played_at);
  if (!customer) {
    return NextResponse.json({
      ...empty,
      cooldownUntil: ipCooldown?.toISOString() ?? null,
    });
  }

  const [{ data: state }, { data: codes }] = await Promise.all([
    db
      .from("customer_merchant_state")
      .select("last_played_at, loyalty_points, points_expire_at, loyalty_code")
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

  // Whichever cooldown (email or IP) ends later wins.
  const emailCooldown = cooldownFrom(state?.last_played_at);
  const cooldownUntil =
    emailCooldown || ipCooldown
      ? new Date(
          Math.max(emailCooldown?.getTime() ?? 0, ipCooldown?.getTime() ?? 0)
        ).toISOString()
      : null;

  // Rolling expiry: a lapsed balance reads as zero (persisted lazily on the
  // next play).
  const pointsExpired =
    state?.points_expire_at != null &&
    new Date(state.points_expire_at).getTime() <= Date.now();

  const result: CustomerState = {
    loyaltyPoints: pointsExpired ? 0 : (state?.loyalty_points ?? 0),
    pointsExpireAt: pointsExpired ? null : (state?.points_expire_at ?? null),
    cooldownUntil,
    loyaltyCode: state?.loyalty_code ?? null,
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
