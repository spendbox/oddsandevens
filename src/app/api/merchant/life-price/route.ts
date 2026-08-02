import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import {
  DEFAULT_LIFE_TOPUP_LIVES,
  DEFAULT_LIFE_TOPUP_MIN_PRICE_KOBO,
  DEFAULT_LIFE_TOPUP_PRICE_KOBO,
  DEFAULT_PLATFORM_SHARE_PERCENT,
} from "@/lib/constants";

// What a block of extra plays costs at this business.
//
// One price for the whole platform made sense while nobody was earning from
// it. Now most of every purchase goes to the business, so the business sets
// the number — a student café and a salon doing ₦40,000 treatments do not
// agree on what one more go is worth.
//
// Null in the column means "whatever the platform default is", so a business
// that never touches this screen still moves when an admin changes the
// default.

const KEYS = [
  "life_topup_price_kobo",
  "life_topup_lives",
  "life_topup_min_price_kobo",
  "platform_revenue_share_percent",
];

async function terms(db: ReturnType<typeof supabaseAdmin>) {
  const { data } = await db
    .from("app_settings")
    .select("key, value")
    .in("key", KEYS);
  const read = (key: string, fallback: number) => {
    const row = (data ?? []).find((r) => r.key === key);
    const value = Number(row?.value ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    defaultPriceKobo: read(
      "life_topup_price_kobo",
      DEFAULT_LIFE_TOPUP_PRICE_KOBO
    ),
    lives: read("life_topup_lives", DEFAULT_LIFE_TOPUP_LIVES),
    minPriceKobo: read(
      "life_topup_min_price_kobo",
      DEFAULT_LIFE_TOPUP_MIN_PRICE_KOBO
    ),
    yourSharePercent:
      100 -
      read("platform_revenue_share_percent", DEFAULT_PLATFORM_SHARE_PERCENT),
  };
}

/** The current price, the floor, and what the business keeps of it. */
export async function GET() {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const [{ data: row }, t] = await Promise.all([
    db
      .from("merchants")
      .select("life_topup_price_kobo")
      .eq("id", merchant.id)
      .maybeSingle(),
    terms(db),
  ]);

  const own = row?.life_topup_price_kobo ?? null;
  return NextResponse.json({
    ...t,
    priceKobo: own ?? t.defaultPriceKobo,
    usingDefault: own === null,
  });
}

/** Set a price, or send null to go back to the platform default. */
export async function POST(req: Request) {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as {
    priceKobo?: unknown;
  } | null;

  const db = supabaseAdmin();
  const t = await terms(db);

  let priceKobo: number | null = null;
  if (body?.priceKobo !== null && body?.priceKobo !== undefined) {
    const value = Math.round(Number(body.priceKobo));
    if (!Number.isFinite(value) || value < t.minPriceKobo) {
      return NextResponse.json(
        { error: "below_minimum", minPriceKobo: t.minPriceKobo },
        { status: 400 }
      );
    }
    // A price nobody would ever pay is a typo, not a strategy.
    if (value > 10_000_00) {
      return NextResponse.json({ error: "too_high" }, { status: 400 });
    }
    priceKobo = value;
  }

  const { error } = await db
    .from("merchants")
    .update({ life_topup_price_kobo: priceKobo })
    .eq("id", merchant.id);
  if (error) {
    console.error("[life-price] save failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  return NextResponse.json({
    ...t,
    priceKobo: priceKobo ?? t.defaultPriceKobo,
    usingDefault: priceKobo === null,
  });
}
