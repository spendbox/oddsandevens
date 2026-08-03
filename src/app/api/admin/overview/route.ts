import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

/**
 * Where the platform's money comes from.
 *
 * Three streams, and they behave differently: the cut of every stake, the
 * 30% of every power-up sale, and the whole of every life bought. Lives are
 * the only one with no contributor attached, which is why they're counted on
 * their own rather than folded into the power-up line.
 */
export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const [{ data: funding }, { data: powerUps }, { data: lives }, { data: boxes }] =
    await Promise.all([
      db.from("funding_orders").select("amount_kobo").eq("status", "paid"),
      db.from("power_up_orders").select("platform_kobo, price_kobo").eq("status", "paid"),
      db.from("life_orders").select("price_kobo, quantity").eq("status", "paid"),
      db.from("boxes").select("status, reward_kobo, platform_fee_kobo"),
    ]);

  const fundingKobo = sum(funding, "amount_kobo");
  const powerUpPlatformKobo = sum(powerUps, "platform_kobo");
  const powerUpGrossKobo = sum(powerUps, "price_kobo");
  const lifeKobo = sum(lives, "price_kobo");

  const boxRows = (boxes ?? []) as {
    status: string;
    reward_kobo: number;
    platform_fee_kobo: number;
  }[];

  // The platform's cut of a box's funding is only banked once the box is
  // actually funded; drafts and unfunded boxes are worth nothing.
  const fundingCutKobo = boxRows
    .filter((b) => ["live", "unlocked", "closed"].includes(b.status))
    .reduce((total, b) => total + Number(b.platform_fee_kobo), 0);

  return NextResponse.json({
    revenue: {
      fundingCutKobo,
      powerUpPlatformKobo,
      lifeKobo,
      totalKobo: fundingCutKobo + powerUpPlatformKobo + lifeKobo,
      contributorKobo: powerUpGrossKobo - powerUpPlatformKobo,
      fundingCollectedKobo: fundingKobo,
      livesSold: sum(lives, "quantity"),
      powerUpsSold: (powerUps ?? []).length,
    },
    boxes: {
      live: boxRows.filter((b) => b.status === "live").length,
      funding: boxRows.filter((b) => b.status === "funding").length,
      unlocked: boxRows.filter((b) => b.status === "unlocked").length,
      rewardsOwedKobo: boxRows
        .filter((b) => b.status === "unlocked")
        .reduce((total, b) => total + Number(b.reward_kobo), 0),
    },
  });
}

function sum(rows: Record<string, unknown>[] | null, key: string): number {
  return (rows ?? []).reduce((total, row) => total + Number(row[key] ?? 0), 0);
}
