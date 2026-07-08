import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import { supabaseServer } from "@/lib/supabase/server";
import {
  DEFAULT_TOPUP_PRICE_PER_1000_KOBO,
  TOPUP_MAX_PLAYS,
  TOPUP_MIN_PLAYS,
} from "@/lib/constants";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";

// Start a Paystack checkout for a play top-up. The business picks any quantity
// of extra plays; we charge proportionally to the admin-set price per 1,000.
// Available on any tier — a free merchant can top up without upgrading.
export async function POST(req: Request) {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }
  if (!paystackConfigured()) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const plays = Number(body?.plays);
  if (
    !Number.isInteger(plays) ||
    plays < TOPUP_MIN_PLAYS ||
    plays > TOPUP_MAX_PLAYS
  ) {
    return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: setting } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "topup_price_per_1000_kobo")
    .maybeSingle();
  const pricePer1000 = Number(setting?.value ?? DEFAULT_TOPUP_PRICE_PER_1000_KOBO);
  const amountKobo = Math.max(1, Math.round((plays / 1000) * pricePer1000));

  const reference = `th_${randomBytes(12).toString("hex")}`;
  const origin = new URL(req.url).origin;

  const { error: insertError } = await db.from("payments").insert({
    merchant_id: merchant.id,
    reference,
    amount_kobo: amountKobo,
    kind: "topup",
    plays_granted: plays,
  });
  if (insertError) {
    console.error("[topup] payment insert failed:", insertError);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  const init = await initializeTransaction({
    email: user.email,
    amountKobo,
    reference,
    callbackUrl: `${origin}/dashboard?payment_ref=${reference}`,
  });
  if (!init) {
    return NextResponse.json({ error: "paystack_failed" }, { status: 502 });
  }

  return NextResponse.json({ authorizationUrl: init.authorizationUrl, reference });
}
