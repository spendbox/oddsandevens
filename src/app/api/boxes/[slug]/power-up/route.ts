import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { appBaseUrl } from "@/lib/base-url";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";
import { newReference } from "@/lib/game/boxes";
import {
  POWER_UPS,
  isAvailable,
  isPowerUpKind,
  parseRevealed,
  splitPowerUp,
} from "@/lib/game/power-ups";
import { findBox, RUN_COLUMNS, type RunRow } from "@/lib/game/view";

/**
 * Buy a power-up for the run in progress.
 *
 * This is where the money actually is. A power-up bought against a
 * contributor's box pays them 70% and us 30%, and Paystack does that split at
 * settlement against their subaccount, so their share never sits in our
 * balance waiting for someone to move it. The public box has no contributor,
 * so there is nothing to split and it all stays here.
 *
 * Nothing is revealed at this point — the order is created `pending` and the
 * effect only fires when the payment is confirmed.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });
  if (!paystackConfigured()) {
    return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { kind?: string };
  const kind = body.kind ?? "";
  if (!isPowerUpKind(kind)) {
    return NextResponse.json({ error: "unknown_power_up" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const box = await findBox(db, slug);
  if (!box) return NextResponse.json({ error: "box_not_found" }, { status: 404 });

  const { data: player } = await db
    .from("players")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!player) return NextResponse.json({ error: "no_run" }, { status: 409 });

  const { data: runData } = await db
    .from("runs")
    .select(RUN_COLUMNS)
    .eq("box_id", box.id)
    .eq("player_id", player.id)
    .eq("status", "active")
    .maybeSingle();
  const run = (runData as RunRow | null) ?? null;
  if (!run) return NextResponse.json({ error: "no_run" }, { status: 409 });

  const revealed = parseRevealed(run.revealed);
  if (!isAvailable(kind, revealed, box.length)) {
    return NextResponse.json({ error: "power_up_spent" }, { status: 409 });
  }

  const powerUp = POWER_UPS[kind];
  const split = box.contributor_id
    ? splitPowerUp(powerUp.priceKobo)
    : { contributorKobo: 0, platformKobo: powerUp.priceKobo };

  const subaccount = box.contributor_id
    ? ((
        await db
          .from("contributors")
          .select("paystack_subaccount_code")
          .eq("id", box.contributor_id)
          .maybeSingle()
      ).data?.paystack_subaccount_code as string | null) ?? null
    : null;

  const reference = newReference("pu");
  const { error } = await db.from("power_up_orders").insert({
    reference,
    run_id: run.id,
    box_id: box.id,
    player_id: player.id,
    contributor_id: box.contributor_id,
    kind,
    price_kobo: powerUp.priceKobo,
    contributor_kobo: split.contributorKobo,
    platform_kobo: split.platformKobo,
  });
  if (error) {
    console.error("[power-up] order insert failed:", error);
    return NextResponse.json({ error: "order_failed" }, { status: 500 });
  }

  const init = await initializeTransaction({
    email,
    amountKobo: powerUp.priceKobo,
    reference,
    callbackUrl: `${appBaseUrl(req)}/b/${box.slug}?reference=${reference}`,
    subaccount,
  });
  if (!init) {
    await db.from("power_up_orders").update({ status: "failed" }).eq("reference", reference);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }

  return NextResponse.json({ result: "redirect", authorizationUrl: init.authorizationUrl });
}
