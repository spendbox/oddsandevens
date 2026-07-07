import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendDiscountCodeEmail } from "@/lib/email";
import { EMAIL_REGEX } from "@/lib/constants";
import type { PointsRedeemResult } from "@/lib/types";

// Trade exactly 3 loyalty points for a 2% discount code (enforced atomically
// in the redeem_loyalty_points Postgres function).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();

  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { result: "error", error: "invalid_request" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("redeem_loyalty_points", {
    p_slug: slug,
    p_email: email,
  });
  if (error) {
    console.error("[redeem_loyalty_points] rpc failed:", error);
    return NextResponse.json(
      { result: "error", error: "internal" },
      { status: 500 }
    );
  }

  const result = data as PointsRedeemResult;

  if (result.result === "discount_issued") {
    const { data: merchant } = await db
      .from("merchants")
      .select("business_name")
      .eq("slug", slug.toLowerCase())
      .single();
    await sendDiscountCodeEmail({
      to: email,
      businessName: merchant?.business_name ?? "the merchant",
      discountPercent: result.discount_percent,
      code: result.code,
      expiresAt: result.expires_at,
    });
  }

  const status =
    result.result === "discount_issued"
      ? 200
      : result.error === "merchant_not_found"
        ? 404
        : 400;
  return NextResponse.json(result, { status });
}
