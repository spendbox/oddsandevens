import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import type { GridStats } from "@/lib/types";

// Every grid the merchant has ever created, with lifetime stats: how many
// tiles were revealed and how many reward codes were unlocked / redeemed.
export async function GET() {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const { data: grids, error } = await db
    .from("grids")
    .select("id, title, image_url, tile_shape, rows, cols, status, created_at")
    .eq("merchant_id", merchant.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[merchant grids] list failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  const gridIds = (grids ?? []).map((g) => g.id);
  if (gridIds.length === 0) return NextResponse.json({ grids: [] });

  const [{ data: tiles }, { data: rewards }] = await Promise.all([
    db
      .from("tiles")
      .select("grid_id, is_revealed")
      .in("grid_id", gridIds),
    db.from("rewards").select("id, grid_id").in("grid_id", gridIds),
  ]);

  const rewardIds = (rewards ?? []).map((r) => r.id);
  const { data: unlocks } = rewardIds.length
    ? await db
        .from("unlocked_rewards")
        .select("reward_id, status")
        .in("reward_id", rewardIds)
    : { data: [] as { reward_id: string; status: string }[] };

  const rewardToGrid = new Map((rewards ?? []).map((r) => [r.id, r.grid_id]));
  const stats = new Map<
    string,
    { tileCount: number; revealedCount: number; unlockedCount: number; redeemedCount: number }
  >();
  for (const id of gridIds) {
    stats.set(id, { tileCount: 0, revealedCount: 0, unlockedCount: 0, redeemedCount: 0 });
  }
  for (const t of tiles ?? []) {
    const s = stats.get(t.grid_id);
    if (!s) continue;
    s.tileCount += 1;
    if (t.is_revealed) s.revealedCount += 1;
  }
  for (const u of unlocks ?? []) {
    const gridId = rewardToGrid.get(u.reward_id);
    const s = gridId ? stats.get(gridId) : undefined;
    if (!s) continue;
    s.unlockedCount += 1;
    if (u.status === "redeemed") s.redeemedCount += 1;
  }

  const result: GridStats[] = (grids ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    imageUrl: g.image_url,
    tileShape: g.tile_shape,
    rows: g.rows,
    cols: g.cols,
    status: g.status,
    createdAt: g.created_at,
    ...stats.get(g.id)!,
  }));
  return NextResponse.json({ grids: result });
}
