import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { DEFAULT_PREMIUM_PRICE_KOBO } from "@/lib/constants";

// Admin: read and set platform settings (currently the premium price).

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data } = await supabaseAdmin()
    .from("app_settings")
    .select("value")
    .eq("key", "premium_price_kobo")
    .maybeSingle();
  return NextResponse.json({
    premiumPriceKobo: Number(data?.value ?? DEFAULT_PREMIUM_PRICE_KOBO),
  });
}

export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const priceKobo = Number(body?.premiumPriceKobo);
  if (!Number.isInteger(priceKobo) || priceKobo < 10_000 || priceKobo > 100_000_000) {
    return NextResponse.json({ error: "invalid_price" }, { status: 400 });
  }
  const { error } = await supabaseAdmin()
    .from("app_settings")
    .upsert({
      key: "premium_price_kobo",
      value: priceKobo,
      updated_at: new Date().toISOString(),
    });
  if (error) {
    console.error("[admin settings] upsert failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ premiumPriceKobo: priceKobo });
}
