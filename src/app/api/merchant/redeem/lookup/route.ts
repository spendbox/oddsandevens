import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import type { StaffLookupResult } from "@/lib/types";

// Staff redemption, step 1: resolve whatever code the customer showed —
// their cycling loyalty code, their fixed reward code, or a legacy one-time
// redemption code. The code itself is the credential; there is deliberately
// no lookup-by-customer-email path.
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

  const { data, error } = await supabaseAdmin().rpc("lookup_staff_code", {
    p_merchant_id: merchant.id,
    p_code: code,
  });
  if (error) {
    console.error("[lookup_staff_code] rpc failed:", error);
    return NextResponse.json(
      { result: "error", error: "internal" },
      { status: 500 }
    );
  }

  const result = data as StaffLookupResult;
  const status =
    result.result === "found"
      ? 200
      : result.error === "code_not_found"
        ? 404
        : 400;
  return NextResponse.json(result, { status });
}
