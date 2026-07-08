import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

// Admin: list and delete businesses. The list links to each business's
// public page (/g/slug) so the admin can inspect it.
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const [{ data: merchants, error }, { data: states }, { data: grids }] =
    await Promise.all([
      db
        .from("merchants")
        .select(
          "id, owner_id, business_name, slug, subscription_tier, premium_expires_at, created_at"
        )
        .order("created_at", { ascending: false }),
      db.from("customer_merchant_state").select("merchant_id"),
      db.from("grids").select("merchant_id, status"),
    ]);
  if (error) {
    console.error("[admin merchants] list failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  const customerCounts = new Map<string, number>();
  for (const s of states ?? []) {
    customerCounts.set(s.merchant_id, (customerCounts.get(s.merchant_id) ?? 0) + 1);
  }
  const activeGridCounts = new Map<string, number>();
  for (const g of grids ?? []) {
    if (g.status === "active") {
      activeGridCounts.set(
        g.merchant_id,
        (activeGridCounts.get(g.merchant_id) ?? 0) + 1
      );
    }
  }

  return NextResponse.json({
    merchants: (merchants ?? []).map((m) => ({
      id: m.id,
      businessName: m.business_name,
      slug: m.slug,
      tier: m.subscription_tier,
      premiumExpiresAt: m.premium_expires_at,
      createdAt: m.created_at,
      customers: customerCounts.get(m.id) ?? 0,
      activeGrids: activeGridCounts.get(m.id) ?? 0,
    })),
  });
}

// Delete a business: removes the Supabase auth account, which cascades the
// merchant row and everything hanging off it (grids, tiles, rewards, codes,
// state). Irreversible.
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
