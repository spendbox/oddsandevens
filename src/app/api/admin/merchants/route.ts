import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

// Admin: list and delete businesses, with what each has made from selling
// extra plays. The list links to each business's public page so the admin can
// inspect it.
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const [
    { data: merchants, error },
    { data: states },
    { data: games },
    { data: purchases },
    { data: revenue },
  ] = await Promise.all([
    db
      .from("merchants")
      .select(
        "id, owner_id, business_name, slug, subscription_tier, premium_expires_at, created_at"
      )
      .order("created_at", { ascending: false }),
    db.from("customer_merchant_state").select("merchant_id"),
    db.from("games").select("merchant_id, status"),
    db.from("life_purchases").select("merchant_id, amount_kobo").eq("status", "paid"),
    db.rpc("life_revenue"),
  ]);
  if (error) {
    console.error("[admin merchants] list failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  const customerCounts = new Map<string, number>();
  for (const s of states ?? []) {
    customerCounts.set(s.merchant_id, (customerCounts.get(s.merchant_id) ?? 0) + 1);
  }
  const liveGameCounts = new Map<string, number>();
  for (const g of games ?? []) {
    if (g.status === "active") {
      liveGameCounts.set(
        g.merchant_id,
        (liveGameCounts.get(g.merchant_id) ?? 0) + 1
      );
    }
  }
  const grossByMerchant = new Map<string, number>();
  for (const p of purchases ?? []) {
    grossByMerchant.set(
      p.merchant_id,
      (grossByMerchant.get(p.merchant_id) ?? 0) + p.amount_kobo
    );
  }

  const money = (revenue ?? {}) as Record<string, number>;
  const share = Number(money.platform_share_percent ?? 30);

  return NextResponse.json({
    merchants: (merchants ?? []).map((m) => ({
      id: m.id,
      businessName: m.business_name,
      slug: m.slug,
      tier: m.subscription_tier,
      premiumExpiresAt: m.premium_expires_at,
      createdAt: m.created_at,
      customers: customerCounts.get(m.id) ?? 0,
      liveGames: liveGameCounts.get(m.id) ?? 0,
      grossKobo: grossByMerchant.get(m.id) ?? 0,
      // The same split the business sees on its own dashboard.
      platformKobo: Math.floor(((grossByMerchant.get(m.id) ?? 0) * share) / 100),
    })),
    revenue: {
      grossKobo: Number(money.gross_kobo ?? 0),
      platformKobo: Number(money.platform_kobo ?? 0),
      businessKobo: Number(money.business_kobo ?? 0),
      gross30dKobo: Number(money.gross_30d_kobo ?? 0),
      orders: Number(money.orders ?? 0),
      livesSold: Number(money.lives_sold ?? 0),
      platformSharePercent: share,
    },
  });
}

// Delete a business: removes the Supabase auth account, which cascades the
// merchant row and everything hanging off it (games, prizes, codes, state).
// Irreversible.
export async function DELETE(req: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: merchant } = await db
    .from("merchants")
    .select("id, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!merchant) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error: authError } = await db.auth.admin.deleteUser(
    merchant.owner_id
  );
  if (authError) {
    console.error("[admin merchants] auth delete failed:", authError);
    // Fall back to deleting just the merchant row (auth user survives).
    const { error } = await db.from("merchants").delete().eq("id", merchant.id);
    if (error) {
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
