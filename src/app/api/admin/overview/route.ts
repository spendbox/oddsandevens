import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

/**
 * Where the platform's money comes from.
 *
 * Three streams: the cut of every box's funding, the 30% of every power-up
 * sale, and the 30% of every life. Lives used to be ours in full; they are now
 * split like everything else a player spends, because a life is bought with a
 * particular safe on screen and the person who put that safe up earns from it.
 * They keep their own line because they're the one stream that can arrive with
 * no contributor at all — bought from the player's own page, or on our box.
 *
 * Every figure is derived from *paid orders*. That is the whole point of this
 * route and it used to be wrong: the funding cut was inferred from a box's
 * status, so a draft an admin closed — never funded, never a naira collected —
 * still added its notional fee to the total. Status describes intent; only an
 * order describes money.
 */
export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const [{ data: funding }, { data: powerUps }, { data: lives }, { data: boxes }] =
    await Promise.all([
      // box_id comes back so the cut can be attributed to the box that was
      // actually paid for, rather than to every box that merely exists.
      db.from("funding_orders").select("box_id, amount_kobo").eq("status", "paid"),
      db
        .from("power_up_orders")
        .select("platform_kobo, contributor_kobo, price_kobo")
        .eq("status", "paid"),
      db
        .from("life_orders")
        .select("price_kobo, platform_kobo, contributor_kobo, quantity")
        .eq("status", "paid"),
      db.from("boxes").select("id, status, reward_kobo, platform_fee_kobo"),
    ]);

  const fundingRows = (funding ?? []) as { box_id: string; amount_kobo: number }[];
  const boxRows = (boxes ?? []) as {
    id: string;
    status: string;
    reward_kobo: number;
    platform_fee_kobo: number;
  }[];

  const fundedBoxIds = new Set(fundingRows.map((row) => row.box_id));
  const fundingCollectedKobo = fundingRows.reduce(
    (total, row) => total + Number(row.amount_kobo),
    0
  );

  // Our share of the funding that actually arrived. Taken from the box's own
  // `platform_fee_kobo` so it matches to the kobo what `splitFunding` and
  // `raise_reward` computed — but only for boxes with a paid order behind them.
  const fundingCutKobo = boxRows
    .filter((box) => fundedBoxIds.has(box.id))
    .reduce((total, box) => total + Number(box.platform_fee_kobo), 0);

  const powerUpPlatformKobo = sum(powerUps, "platform_kobo");
  const lifePlatformKobo = sum(lives, "platform_kobo");
  const lifeGrossKobo = sum(lives, "price_kobo");

  return NextResponse.json({
    revenue: {
      fundingCutKobo,
      powerUpPlatformKobo,
      lifeKobo: lifePlatformKobo,
      lifeGrossKobo,
      totalKobo: fundingCutKobo + powerUpPlatformKobo + lifePlatformKobo,
      // Everything paid through to contributors, from both streams.
      contributorKobo: sum(powerUps, "contributor_kobo") + sum(lives, "contributor_kobo"),
      fundingCollectedKobo,
      livesSold: sum(lives, "quantity"),
      powerUpsSold: (powerUps ?? []).length,
    },
    boxes: {
      live: boxRows.filter((b) => b.status === "live").length,
      funding: boxRows.filter((b) => b.status === "funding").length,
      unlocked: boxRows.filter((b) => b.status === "unlocked").length,
      // Owed, not paid: what unlocked boxes have promised their winners.
      rewardsOwedKobo: boxRows
        .filter((b) => b.status === "unlocked")
        .reduce((total, b) => total + Number(b.reward_kobo), 0),
    },
  });
}

function sum(rows: Record<string, unknown>[] | null, key: string): number {
  return (rows ?? []).reduce((total, row) => total + Number(row[key] ?? 0), 0);
}
