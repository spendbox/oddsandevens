import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import { sendRewardRedeemedEmail } from "@/lib/email";
import type { LoyaltyRedeemResult, RedeemResult } from "@/lib/types";

// Staff redemption, step 2 (step 1 is /api/merchant/redeem/lookup): confirm
// what the lookup resolved. Two kinds:
//   loyalty — burn the customer's points for a discount; their loyalty code
//             cycles server-side so it can't be replayed.
//   code    — a one-time redemption code minted per unlock (reward win or
//             old loyalty discount); redeems once and reshuffles the grid.
export async function POST(req: Request) {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const kind = String(body?.kind ?? "");
  if (kind !== "loyalty" && kind !== "code") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const code = String(body?.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json(
      { result: "error", error: "code_not_found" },
      { status: 404 }
    );
  }

  const fn = kind === "loyalty" ? "redeem_loyalty_by_code" : "redeem_code";
  const { data, error } = await supabaseAdmin().rpc(fn, {
    p_merchant_id: merchant.id,
    p_code: code,
  });
  if (error) {
    console.error(`[${fn}] rpc failed:`, error);
    return NextResponse.json(
      { result: "error", error: "internal" },
      { status: 500 }
    );
  }

  const result = data as LoyaltyRedeemResult | RedeemResult;

  // Notify the customer that their gift was redeemed (best-effort).
  if (
    kind === "code" &&
    result.result === "redeemed" &&
    "reward_type" in result &&
    result.reward_type === "tile" &&
    result.customer_email
  ) {
    await sendRewardRedeemedEmail({
      to: result.customer_email,
      businessName: merchant.business_name,
      slug: merchant.slug,
      description: result.description,
    });
  }

  const status =
    result.result !== "error"
      ? 200
      : result.error === "code_not_found"
        ? 404
        : 409;
  return NextResponse.json(result, { status });
}
