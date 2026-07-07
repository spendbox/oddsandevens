import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import { supabaseServer } from "@/lib/supabase/server";
import { DEFAULT_PREMIUM_PRICE_KOBO } from "@/lib/constants";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";

// Report the premium price so the dashboard can show it on the upsell card.
export async function GET() {
  const { userId } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data } = await supabaseAdmin()
    .from("app_settings")
    .select("value")
    .eq("key", "premium_price_kobo")
    .maybeSingle();
  return NextResponse.json({
    premiumPriceKobo: Number(data?.value ?? DEFAULT_PREMIUM_PRICE_KOBO),
    paymentsEnabled: paystackConfigured(),
  });
}

// Start a Paystack checkout for the premium upgrade. Returns the hosted
// payment page URL; the dashboard redirects the merchant there.
export async function POST(req: Request) {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }
  if (merchant.subscription_tier === "premium") {
    return NextResponse.json({ error: "already_premium" }, { status: 409 });
  }
  if (!paystackConfigured()) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
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
    .eq("key", "premium_price_kobo")
    .maybeSingle();
  const amountKobo = Number(setting?.value ?? DEFAULT_PREMIUM_PRICE_KOBO);

  const reference = `th_${randomBytes(12).toString("hex")}`;
  const origin = new URL(req.url).origin;

  const { error: insertError } = await db.from("payments").insert({
    merchant_id: merchant.id,
    reference,
    amount_kobo: amountKobo,
  });
  if (insertError) {
    console.error("[upgrade] payment insert failed:", insertError);
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
