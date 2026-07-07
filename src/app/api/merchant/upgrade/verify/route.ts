import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant, isPremium } from "@/lib/merchant-auth";
import { verifyTransaction } from "@/lib/paystack";
import { PREMIUM_TERM_DAYS } from "@/lib/constants";

// Called by the dashboard when Paystack redirects back with ?payment_ref=.
// Verifies the transaction server-side and grants a year of premium —
// renewing early stacks on top of the time that's still left.
export async function POST(req: Request) {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const reference = String(body?.reference ?? "").trim();
  if (!/^th_[0-9a-f]{24}$/.test(reference)) {
    return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: payment } = await db
    .from("payments")
    .select("id, merchant_id, amount_kobo, status")
    .eq("reference", reference)
    .maybeSingle();
  if (!payment || payment.merchant_id !== merchant.id) {
    return NextResponse.json({ error: "payment_not_found" }, { status: 404 });
  }
  if (payment.status === "success") {
    return NextResponse.json({ result: "upgraded" });
  }

  const verification = await verifyTransaction(reference);
  if (!verification) {
    return NextResponse.json({ error: "paystack_failed" }, { status: 502 });
  }
  // The amount check stops a cheaper, unrelated successful charge from being
  // replayed as a premium payment.
  if (!verification.success || verification.amountKobo < payment.amount_kobo) {
    await db
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id)
      .eq("status", "pending");
    return NextResponse.json({ error: "payment_not_successful" }, { status: 402 });
  }

  // A year on top of whatever is left (or from now, if lapsed/new).
  const base = isPremium(merchant)
    ? new Date(merchant.premium_expires_at!).getTime()
    : Date.now();
  const premiumExpiresAt = new Date(
    base + PREMIUM_TERM_DAYS * 86400_000
  ).toISOString();

  const { error: payError } = await db
    .from("payments")
    .update({ status: "success", paid_at: new Date().toISOString() })
    .eq("id", payment.id);
  const { error: tierError } = await db
    .from("merchants")
    .update({
      subscription_tier: "premium",
      premium_expires_at: premiumExpiresAt,
    })
    .eq("id", merchant.id);
  if (payError || tierError) {
    console.error("[upgrade verify] update failed:", payError ?? tierError);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  return NextResponse.json({ result: "upgraded", premiumExpiresAt });
}
