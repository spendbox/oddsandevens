import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import { SLUG_REGEX } from "@/lib/constants";

// Merchant onboarding: create the merchant profile for the logged-in user.
export async function POST(req: Request) {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (merchant) {
    return NextResponse.json({ error: "merchant_exists" }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const businessName = String(body?.businessName ?? "").trim();
  const slug = String(body?.slug ?? "").trim().toLowerCase();

  if (businessName.length < 1 || businessName.length > 80) {
    return NextResponse.json({ error: "invalid_business_name" }, { status: 400 });
  }
  if (!SLUG_REGEX.test(slug)) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("merchants")
    .insert({ owner_id: userId, business_name: businessName, slug })
    .select("id, business_name, slug, subscription_tier, premium_expires_at")
    .single();

  if (error) {
    // 23505 = unique_violation (slug already taken)
    if (error.code === "23505") {
      return NextResponse.json({ error: "slug_taken" }, { status: 409 });
    }
    console.error("[merchant create] failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
