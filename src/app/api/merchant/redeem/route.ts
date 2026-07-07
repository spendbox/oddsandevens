import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import type { RedeemResult } from "@/lib/types";

// Staff redemption: type the code the customer shows. There is deliberately
// no lookup-by-customer-email path — the code itself is the credential.
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
  const status =
    result.result === "redeemed"
      ? 200
      : result.error === "code_not_found"
        ? 404
        : 409;
  return NextResponse.json(result, { status });
}
