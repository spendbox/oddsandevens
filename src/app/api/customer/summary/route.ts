import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { COOLDOWN_HOURS, EMAIL_REGEX } from "@/lib/constants";
import type { PlayerAccount } from "@/lib/types";

// The customer portal (/me): every business this email plays with and the
// codes they have won. Same email-only trust model as the per-merchant /me
// endpoint — the email is the credential (v1 has no customer auth).
export async function GET(req: Request) {
  // A verified browser doesn't have to say who it is — and what it says is
  // ignored, so the cookie is also the stronger claim of the two.
  const asked = (new URL(req.url).searchParams.get("email") ?? "")
    .trim()
    .toLowerCase();
  const email = (await playerEmail()) ?? asked;
  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: customer } = await db
    .from("customers")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!customer) return NextResponse.json({ email, accounts: [] });

  const [{ data: states }, { data: unlocks }] = await Promise.all([
    db
      .from("customer_merchant_state")
      .select(
        "merchant_id, last_played_at, merchants(business_name, slug, logo_url, brand_color)"
      )
      .eq("customer_id", customer.id),
    db
      .from("unlocked_rewards")
      .select(
        "merchant_id, redemption_code, reward_type, discount_percent, status, expires_at, rewards(description), game_prizes(description)"
      )
      .eq("customer_id", customer.id)
      .eq("status", "unredeemed")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true }),
  ]);

  const codesByMerchant = new Map<string, PlayerAccount["codes"]>();
  for (const u of unlocks ?? []) {
    const list = codesByMerchant.get(u.merchant_id) ?? [];
    list.push({
      code: u.redemption_code,
      // Codes minted by the retired products are still valid, so they still
      // have to describe themselves.
      description:
        u.reward_type === "loyalty_discount"
          ? `${u.discount_percent}% discount`
          : u.reward_type === "game"
            ? ((u.game_prizes as unknown as { description: string } | null)
                ?.description ?? "Game prize")
            : ((u.rewards as unknown as { description: string } | null)
                ?.description ?? "Reward"),
      status: u.status,
      expiresAt: u.expires_at,
    });
    codesByMerchant.set(u.merchant_id, list);
  }

  const now = Date.now();
  const accounts: PlayerAccount[] = (states ?? [])
    .map((s) => {
      const m = s.merchants as unknown as {
        business_name: string;
        slug: string;
        logo_url: string | null;
        brand_color: string;
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
        cooldownUntil,
        codes: codesByMerchant.get(s.merchant_id) ?? [],
      };
    })
    .filter((a): a is PlayerAccount => a !== null)
    // Whoever they have codes waiting with, first.
    .sort((a, b) => b.codes.length - a.codes.length);

  return NextResponse.json({ email, accounts });
}
