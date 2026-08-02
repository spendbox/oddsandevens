import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import { sendRewardRedeemedEmail } from "@/lib/email";
import type { RedeemResult } from "@/lib/types";

// Staff redemption, step 2 (step 1 is /api/merchant/redeem/lookup): confirm
// what the lookup resolved.
//
// There is one kind of code now. Points used to be redeemable at the counter
// too, on a code that cycled server-side — that whole second currency is gone,
// so what staff take is a one-time code minted when a prize was won.
export async function POST(req: Request) {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json(
      { result: "error", error: "code_not_found" },
      { status: 404 }
    );
  }

  const { data, error } = await supabaseAdmin().rpc("redeem_code", {
    p_merchant_id: merchant.id,
    p_code: code,
  });
  if (error) {
    console.error("[redeem_code] rpc failed:", error);
    return NextResponse.json(
      { result: "error", error: "internal" },
      { status: 500 }
    );
  }

  const result = data as RedeemResult;

  // Tell the customer their prize was collected (best-effort).
  if (result.result === "redeemed" && result.customer_email) {
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
