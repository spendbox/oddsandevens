import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

// Admin: list and delete customers (players). Customers are email-only
// identities; deleting one cascades their per-merchant state and codes.
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const [{ data: customers, error }, { data: states }] = await Promise.all([
    db
      .from("customers")
      .select("id, email, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    db
      .from("customer_merchant_state")
      .select("customer_id, loyalty_points, total_plays"),
  ]);
  if (error) {
    console.error("[admin customers] list failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  const agg = new Map<string, { businesses: number; points: number; plays: number }>();
  for (const s of states ?? []) {
    const entry = agg.get(s.customer_id) ?? { businesses: 0, points: 0, plays: 0 };
    entry.businesses += 1;
    entry.points += s.loyalty_points;
    entry.plays += s.total_plays ?? 0;
    agg.set(s.customer_id, entry);
  }

  return NextResponse.json({
    customers: (customers ?? []).map((c) => ({
      id: c.id,
      email: c.email,
      createdAt: c.created_at,
      businesses: agg.get(c.id)?.businesses ?? 0,
      points: agg.get(c.id)?.points ?? 0,
      plays: agg.get(c.id)?.plays ?? 0,
    })),
  });
}

// Delete a customer: cascades their state, codes, and unlocks. Irreversible.
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

  const { error } = await supabaseAdmin().from("customers").delete().eq("id", id);
  if (error) {
    console.error("[admin customers] delete failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
