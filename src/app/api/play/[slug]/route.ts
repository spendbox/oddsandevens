import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PublicBoardState, PublicGrid } from "@/lib/types";

// Public board state for the play page: merchant branding plus every active
// grid. Returns dimensions and already-revealed tiles only — reward positions
// for unrevealed tiles never leave the database.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const db = supabaseAdmin();

  const { data: merchant } = await db
    .from("merchants")
    .select(
      "id, business_name, logo_url, tagline, brand_color, whatsapp, contact_email, points_per_discount, discount_percent"
    )
    .eq("slug", slug.toLowerCase())
    .single();
  if (!merchant) {
    return NextResponse.json({ error: "merchant_not_found" }, { status: 404 });
  }

  const { data: grids } = await db
    .from("grids")
    .select("id, title, image_url, tile_shape, rows, cols, created_at")
    .eq("merchant_id", merchant.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (!grids || grids.length === 0) {
    return NextResponse.json({ error: "no_active_grid" }, { status: 404 });
  }

  const gridIds = grids.map((g) => g.id);
  const [{ data: revealedTiles }, { data: rewards }] = await Promise.all([
    db
      .from("tiles")
      .select("grid_id, row_index, col_index, reward_id, revealed_by_customer_id")
      .in("grid_id", gridIds)
      .eq("is_revealed", true),
    db
      .from("rewards")
      .select("id, grid_id, max_redemptions")
      .in("grid_id", gridIds),
  ]);

  const rewardIds = (rewards ?? []).map((r) => r.id);
  const { data: claims } = rewardIds.length
    ? await db
        .from("unlocked_rewards")
        .select("reward_id, customer_id")
        .in("reward_id", rewardIds)
    : { data: [] as { reward_id: string; customer_id: string }[] };

  // A revealed tile counts as a hit if its reward was actually claimed by the
  // customer who revealed it (a reward tile revealed after exhaustion is a miss).
  const claimKeys = new Set(
    (claims ?? []).map((c) => `${c.reward_id}:${c.customer_id}`)
  );
  const claimCounts = new Map<string, number>();
  for (const c of claims ?? []) {
    claimCounts.set(c.reward_id, (claimCounts.get(c.reward_id) ?? 0) + 1);
  }

  const publicGrids: PublicGrid[] = grids.map((g) => ({
    id: g.id,
    title: g.title,
    imageUrl: g.image_url,
    tileShape: g.tile_shape,
    rows: g.rows,
    cols: g.cols,
    revealed: (revealedTiles ?? [])
      .filter((t) => t.grid_id === g.id)
      .map((t) => ({
        row: t.row_index,
        col: t.col_index,
        hit:
          t.reward_id !== null &&
          t.revealed_by_customer_id !== null &&
          claimKeys.has(`${t.reward_id}:${t.revealed_by_customer_id}`),
      })),
    rewardsRemaining: (rewards ?? [])
      .filter((r) => r.grid_id === g.id)
      .reduce(
        (sum, r) =>
          sum + Math.max(r.max_redemptions - (claimCounts.get(r.id) ?? 0), 0),
        0
      ),
  }));

  const state: PublicBoardState = {
    businessName: merchant.business_name,
    logoUrl: merchant.logo_url,
    tagline: merchant.tagline,
    brandColor: merchant.brand_color,
    whatsapp: merchant.whatsapp,
    contactEmail: merchant.contact_email,
    pointsPerDiscount: merchant.points_per_discount,
    discountPercent: merchant.discount_percent,
    grids: publicGrids,
  };
  return NextResponse.json(state);
}
