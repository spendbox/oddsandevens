import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import {
  DEFAULT_FREE_YEARLY_PLAYS,
  DEFAULT_LIFE_TOPUP_LIVES,
  DEFAULT_LIFE_TOPUP_PRICE_KOBO,
  DEFAULT_PLATFORM_SHARE_PERCENT,
  DEFAULT_PREMIUM_PRICE_KOBO,
  DEFAULT_PREMIUM_YEARLY_PLAYS,
  DEFAULT_TOPUP_PRICE_PER_1000_KOBO,
} from "@/lib/constants";

// Admin: read and set platform settings — what a business pays (premium, the
// annual allowances, the per-1,000 top-up) and what a *player* pays for extra
// plays, plus how that is split with the business.

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data } = await supabaseAdmin()
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "premium_price_kobo",
      "free_yearly_plays",
      "premium_yearly_plays",
      "topup_price_per_1000_kobo",
      "life_topup_price_kobo",
      "life_topup_lives",
      "platform_revenue_share_percent",
      "free_live_games",
    ]);
  const s = new Map((data ?? []).map((r) => [r.key, Number(r.value)]));
  return NextResponse.json({
    premiumPriceKobo: s.get("premium_price_kobo") ?? DEFAULT_PREMIUM_PRICE_KOBO,
    freeYearlyPlays: s.get("free_yearly_plays") ?? DEFAULT_FREE_YEARLY_PLAYS,
    premiumYearlyPlays:
      s.get("premium_yearly_plays") ?? DEFAULT_PREMIUM_YEARLY_PLAYS,
    topupPricePer1000Kobo:
      s.get("topup_price_per_1000_kobo") ?? DEFAULT_TOPUP_PRICE_PER_1000_KOBO,
    lifeTopupPriceKobo:
      s.get("life_topup_price_kobo") ?? DEFAULT_LIFE_TOPUP_PRICE_KOBO,
    lifeTopupLives: s.get("life_topup_lives") ?? DEFAULT_LIFE_TOPUP_LIVES,
    platformSharePercent:
      s.get("platform_revenue_share_percent") ?? DEFAULT_PLATFORM_SHARE_PERCENT,
    freeLiveGames: s.get("free_live_games") ?? 1,
  });
}

// Each field is validated independently; only the ones sent are updated.
export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const updates: { key: string; value: number }[] = [];

  if (body?.premiumPriceKobo !== undefined) {
    const v = Number(body.premiumPriceKobo);
    if (!Number.isInteger(v) || v < 10_000 || v > 100_000_000) {
      return NextResponse.json({ error: "invalid_price" }, { status: 400 });
    }
    updates.push({ key: "premium_price_kobo", value: v });
  }
  if (body?.freeYearlyPlays !== undefined) {
    const v = Number(body.freeYearlyPlays);
    if (!Number.isInteger(v) || v < 0 || v > 10_000_000) {
      return NextResponse.json({ error: "invalid_free_plays" }, { status: 400 });
    }
    updates.push({ key: "free_yearly_plays", value: v });
  }
  if (body?.premiumYearlyPlays !== undefined) {
    const v = Number(body.premiumYearlyPlays);
    if (!Number.isInteger(v) || v < 0 || v > 100_000_000) {
      return NextResponse.json({ error: "invalid_premium_plays" }, { status: 400 });
    }
    updates.push({ key: "premium_yearly_plays", value: v });
  }
  if (body?.topupPricePer1000Kobo !== undefined) {
    const v = Number(body.topupPricePer1000Kobo);
    if (!Number.isInteger(v) || v < 1_000 || v > 100_000_000) {
      return NextResponse.json({ error: "invalid_topup_price" }, { status: 400 });
    }
    updates.push({ key: "topup_price_per_1000_kobo", value: v });
  }

  if (body?.lifeTopupPriceKobo !== undefined) {
    const v = Number(body.lifeTopupPriceKobo);
    // ₦10 to ₦100,000 a block: low enough to be a real promotion, high enough
    // that a typo can't quietly charge someone a fortune.
    if (!Number.isInteger(v) || v < 1_000 || v > 10_000_000) {
      return NextResponse.json({ error: "invalid_life_price" }, { status: 400 });
    }
    updates.push({ key: "life_topup_price_kobo", value: v });
  }
  if (body?.lifeTopupLives !== undefined) {
    const v = Number(body.lifeTopupLives);
    if (!Number.isInteger(v) || v < 1 || v > 500) {
      return NextResponse.json({ error: "invalid_life_count" }, { status: 400 });
    }
    updates.push({ key: "life_topup_lives", value: v });
  }
  if (body?.platformSharePercent !== undefined) {
    const v = Number(body.platformSharePercent);
    if (!Number.isInteger(v) || v < 0 || v > 100) {
      return NextResponse.json({ error: "invalid_share" }, { status: 400 });
    }
    updates.push({ key: "platform_revenue_share_percent", value: v });
  }
  if (body?.freeLiveGames !== undefined) {
    const v = Number(body.freeLiveGames);
    if (!Number.isInteger(v) || v < 1 || v > 100) {
      return NextResponse.json({ error: "invalid_free_games" }, { status: 400 });
    }
    updates.push({ key: "free_live_games", value: v });
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const { error } = await supabaseAdmin()
    .from("app_settings")
    .upsert(
      updates.map((u) => ({
        key: u.key,
        value: u.value,
        updated_at: new Date().toISOString(),
      }))
    );
  if (error) {
    console.error("[admin settings] upsert failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
