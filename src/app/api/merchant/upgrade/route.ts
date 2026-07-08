import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import { supabaseServer } from "@/lib/supabase/server";
import { DEFAULT_PREMIUM_PRICE_KOBO } from "@/lib/constants";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";
import { appBaseUrl } from "@/lib/base-url";

// Report the premium price (per year) and the merchant's current expiry so
// the dashboard can show the upsell / renewal card.
export async function GET() {
  const { userId, merchant } = await getAuthedMerchant();
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
    premiumExpiresAt: merchant?.premium_expires_at ?? null,
  });
}

// Start a Paystack checkout for the yearly premium plan. Also used to renew:
// a payment while premium is still running extends the expiry by a year.
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
  const origin = appBaseUrl(req);

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
