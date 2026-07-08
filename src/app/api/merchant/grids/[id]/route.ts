import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { effectiveTier, getAuthedMerchant } from "@/lib/merchant-auth";
import { TIER_LIMITS } from "@/lib/constants";

// Archive or re-activate one of the merchant's grids. Re-activation counts
// against the tier's active-grid cap (free 1 / premium 10).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const status = String(body?.status ?? "");
  if (status !== "active" && status !== "archived") {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: grid } = await db
    .from("grids")
    .select("id, merchant_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!grid || grid.merchant_id !== merchant.id) {
    return NextResponse.json({ error: "grid_not_found" }, { status: 404 });
  }
  if (grid.status === status) return NextResponse.json({ ok: true });

  if (status === "active") {
    // Premium has no cap (Infinity); only finite tiers need the count check.
    const cap = TIER_LIMITS[effectiveTier(merchant)].maxActiveGrids;
    if (Number.isFinite(cap)) {
      const { count } = await db
        .from("grids")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchant.id)
        .eq("status", "active");
      if ((count ?? 0) >= cap) {
        return NextResponse.json(
          { error: "too_many_active_grids" },
          { status: 409 }
        );
      }
    }
  }

  const { error } = await db.from("grids").update({ status }).eq("id", grid.id);
  if (error) {
    console.error("[merchant grid status] update failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// Permanently delete a grid. Tiles and rewards cascade away; already-issued
// codes survive (unlocked_rewards.reward_id is ON DELETE SET NULL) so
// customers can still redeem what they won.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const { data: grid } = await db
    .from("grids")
    .select("id, merchant_id")
    .eq("id", id)
    .maybeSingle();
  if (!grid || grid.merchant_id !== merchant.id) {
    return NextResponse.json({ error: "grid_not_found" }, { status: 404 });
  }

  const { error } = await db.from("grids").delete().eq("id", grid.id);
  if (error) {
    console.error("[merchant grid delete] failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
