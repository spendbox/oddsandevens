import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import type { LoyaltyRedeemResult, RedeemResult } from "@/lib/types";

// Staff redemption, step 2 (step 1 is /api/merchant/redeem/lookup): confirm
// what the lookup resolved. Three kinds:
//   loyalty — burn the customer's points for a discount; their loyalty code
//             cycles server-side so it can't be replayed.
//   reward  — redeem one specific unlocked reward picked from the lookup list.
//   legacy  — a one-time code from an old email; redeems as before.
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
  const db = supabaseAdmin();

  if (kind === "loyalty" || kind === "legacy") {
    const code = String(body?.code ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      return NextResponse.json(
        { result: "error", error: "code_not_found" },
        { status: 404 }
      );
    }

    const fn = kind === "loyalty" ? "redeem_loyalty_by_code" : "redeem_code";
    const { data, error } = await db.rpc(fn, {
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
    const status =
      result.result !== "error"
        ? 200
        : result.error === "code_not_found"
          ? 404
          : 409;
    return NextResponse.json(result, { status });
  }

  if (kind === "reward") {
    const unlockedId = String(body?.unlockedId ?? "");
    if (!unlockedId) {
      return NextResponse.json(
        { result: "error", error: "code_not_found" },
        { status: 404 }
      );
    }

    const { data, error } = await db.rpc("redeem_unlocked_reward", {
      p_merchant_id: merchant.id,
      p_unlocked_id: unlockedId,
    });
    if (error) {
      console.error("[redeem_unlocked_reward] rpc failed:", error);
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

  return NextResponse.json({ error: "invalid_request" }, { status: 400 });
}
