import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyTransaction } from "@/lib/paystack";
import { PREMIUM_TERM_DAYS } from "@/lib/constants";

export type SettleResult =
  | {
      ok: true;
      result: "upgraded" | "topped_up";
      plays?: number;
      premiumExpiresAt?: string;
    }
  | { ok: false; status: number; error: string };

// Settle a Paystack payment by reference: verify it with Paystack, mark it paid
// exactly once, then credit either a premium year or the purchased top-up plays.
// Idempotent and safe to call from both the browser-redirect verify route and
// the server-to-server webhook, so crediting never depends on the customer's
// tab making it back. Pass expectedMerchantId to enforce ownership when the
// caller is an authenticated merchant.
export async function settlePayment(
  reference: string,
  expectedMerchantId?: string
): Promise<SettleResult> {
  const db = supabaseAdmin();

  const { data: payment } = await db
    .from("payments")
    .select("id, merchant_id, amount_kobo, status, kind, plays_granted")
    .eq("reference", reference)
    .maybeSingle();
  if (!payment) return { ok: false, status: 404, error: "payment_not_found" };
  if (expectedMerchantId && payment.merchant_id !== expectedMerchantId) {
    return { ok: false, status: 404, error: "payment_not_found" };
  }

  const kind = (payment.kind as "premium" | "topup") ?? "premium";
  const doneResult = kind === "topup" ? "topped_up" : "upgraded";
  if (payment.status === "success") {
    return { ok: true, result: doneResult, plays: payment.plays_granted };
  }

  const verification = await verifyTransaction(reference);
  if (!verification) return { ok: false, status: 502, error: "paystack_failed" };
  // The amount check stops a cheaper, unrelated successful charge being
  // replayed as a paid product.
  if (!verification.success || verification.amountKobo < payment.amount_kobo) {
    await db
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id)
      .eq("status", "pending");
    return { ok: false, status: 402, error: "payment_not_successful" };
  }

  // Flip to success first (guarded), so concurrent callers can't double-credit.
  const { error: payError, count } = await db
    .from("payments")
    .update(
      { status: "success", paid_at: new Date().toISOString() },
      { count: "exact" }
    )
    .eq("id", payment.id)
    .eq("status", "pending");
  if (payError) {
    console.error("[settle] payment update failed:", payError);
    return { ok: false, status: 500, error: "internal" };
  }
  if (count === 0) {
    // Someone else already applied it.
    return { ok: true, result: doneResult, plays: payment.plays_granted };
  }

  if (kind === "topup") {
    const { error } = await db.rpc("credit_topup_plays", {
      p_merchant_id: payment.merchant_id,
      p_plays: payment.plays_granted,
    });
    if (error) {
      console.error("[settle] topup credit failed:", error);
      return { ok: false, status: 500, error: "internal" };
    }
    return { ok: true, result: "topped_up", plays: payment.plays_granted };
  }

  // Premium: a year on top of whatever is left, plus a fresh annual play window.
  const { data: merchant } = await db
    .from("merchants")
    .select("subscription_tier, premium_expires_at")
    .eq("id", payment.merchant_id)
    .maybeSingle();
  const currentlyPremium =
    merchant?.subscription_tier === "premium" &&
    !!merchant?.premium_expires_at &&
    new Date(merchant.premium_expires_at).getTime() > Date.now();
  const base = currentlyPremium
    ? new Date(merchant!.premium_expires_at!).getTime()
    : Date.now();
  const premiumExpiresAt = new Date(
    base + PREMIUM_TERM_DAYS * 86400_000
  ).toISOString();

  const { error } = await db
    .from("merchants")
    .update({
      subscription_tier: "premium",
      premium_expires_at: premiumExpiresAt,
      plays_used: 0,
      plays_period_start: new Date().toISOString(),
    })
    .eq("id", payment.merchant_id);
  if (error) {
    console.error("[settle] premium update failed:", error);
    return { ok: false, status: 500, error: "internal" };
  }
  return { ok: true, result: "upgraded", premiumExpiresAt };
}
