import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

/**
 * Where the platform's money comes from.
 *
 * Four streams: the cut of every box's funding, what a promo safe was sold
 * for, the 30% of every power-up sale, and the 30% of every life. Lives used
 * to be ours in full; they are now split like everything else a player spends,
 * because a life is bought with a particular safe on screen and the person who
 * put that safe up earns from it. They keep their own line because they're the
 * one stream that can arrive with no contributor at all — bought from the
 * player's own page, or on our box.
 *
 * Promo safes keep their own line for the opposite reason: their price is
 * *entirely* ours rather than a cut of somebody's reward, because the pot
 * behind one is ours to find. Summing them into the funding cut would say we
 * take a third of a promo safe, and summing what a promo safe is exposed to
 * into this screen's other figures would net a liability off income. What we
 * stand to pay out on them is on the Boxes tab, where it belongs.
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
      db.from("boxes").select("id, kind, status, reward_kobo, platform_fee_kobo, seeded_at"),
    ]);

  const fundingRows = (funding ?? []) as { box_id: string; amount_kobo: number }[];
  const boxRows = (boxes ?? []) as {
    id: string;
    kind: string;
    status: string;
    reward_kobo: number;
    platform_fee_kobo: number;
    seeded_at: string | null;
  }[];

  const fundedBoxIds = new Set(fundingRows.map((row) => row.box_id));
  const fundingCollectedKobo = fundingRows.reduce(
    (total, row) => total + Number(row.amount_kobo),
    0
  );

  // Only boxes with a paid order behind them, split by what the money was.
  const paidBoxes = boxRows.filter((box) => fundedBoxIds.has(box.id));

  // Our share of the funding that actually arrived. Taken from the box's own
  // `platform_fee_kobo` so it matches to the kobo what `splitFunding` and
  // `raise_reward` computed.
  const fundingCutKobo = paidBoxes
    .filter((box) => box.kind !== "promo")
    .reduce((total, box) => total + Number(box.platform_fee_kobo), 0);

  // A promo safe's price, which is ours in full — `create_promo_box` records
  // it as the whole platform fee, so this reads off the same column as the
  // funding cut rather than re-deriving a price that may since have changed.
  const promoBoxes = paidBoxes.filter((box) => box.kind === "promo");
  const promoKobo = promoBoxes.reduce((total, box) => total + Number(box.platform_fee_kobo), 0);

  const powerUpPlatformKobo = sum(powerUps, "platform_kobo");
  const lifePlatformKobo = sum(lives, "platform_kobo");
  const lifeGrossKobo = sum(lives, "price_kobo");

  return NextResponse.json({
    revenue: {
      fundingCutKobo,
      promoKobo,
      promoSold: promoBoxes.length,
      powerUpPlatformKobo,
      lifeKobo: lifePlatformKobo,
      lifeGrossKobo,
      totalKobo: fundingCutKobo + promoKobo + powerUpPlatformKobo + lifePlatformKobo,
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
      //
      // Seeded boxes are excluded, and that is the point of marking them. A
      // box authored as already-cracked has no winner and no claim behind it,
      // so counting its reward here would put a debt on this screen that
      // nobody is owed and nobody could ever tick off.
      rewardsOwedKobo: boxRows
        .filter((b) => b.status === "unlocked" && !b.seeded_at)
        .reduce((total, b) => total + Number(b.reward_kobo), 0),
    },
  });
}

function sum(rows: Record<string, unknown>[] | null, key: string): number {
  return (rows ?? []).reduce((total, row) => total + Number(row[key] ?? 0), 0);
}
