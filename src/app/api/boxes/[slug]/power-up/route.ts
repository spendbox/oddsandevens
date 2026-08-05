import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { appBaseUrl } from "@/lib/base-url";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";
import { newReference } from "@/lib/game/boxes";
import {
  discountedKobo,
  isAvailable,
  isPowerUpKind,
  parseRevealed,
  priceKobo,
  splitPowerUp,
} from "@/lib/game/power-ups";
import { findBox, findHunt } from "@/lib/game/view";
import { loadPricing, resolved } from "@/lib/game/pricing";

/**
 * Buy a power-up for the hunt in progress.
 *
 * This is where the money actually is. A power-up bought against a
 * contributor's box pays them 70% and us 30%. That split used to be made by
 * Paystack at settlement, against a subaccount; it is recorded on the order
 * and paid out by hand now, weekly, from the ledger the admin screen works
 * through. The two halves of every sale are still written down at the moment
 * of sale — `contributor_kobo` and `platform_kobo` — which is what makes the
 * ledger add up whoever moves the money.
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
  if (!player) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  // A power-up needs a hunt to reveal into. Buying one before a first guess
  // is legitimate — it's how a careful player opens — so the hunt is created
  // here if it doesn't exist yet. It costs nothing; only guesses cost lives.
  let hunt = await findHunt(db, box.id, player.id);
  if (!hunt) {
    await db.from("hunts").insert({ box_id: box.id, player_id: player.id });
    hunt = await findHunt(db, box.id, player.id);
  }
  if (!hunt) return NextResponse.json({ error: "hunt_failed" }, { status: 500 });
  if (hunt.won_at) return NextResponse.json({ error: "already_won" }, { status: 409 });

  const revealed = parseRevealed(hunt.revealed);
  if (!isAvailable(kind, revealed)) {
    return NextResponse.json({ error: "power_up_spent" }, { status: 409 });
  }

  // Priced here, off the box's own reward, and never taken from the request.
  // The browser is told the price so it can show it; it doesn't get to name it.
  //
  // A claimed drop can take a share off, and that share is read from the
  // database rather than the request for exactly the same reason: a discount
  // the client names is a discount the client can name itself.
  const money = resolved(await loadPricing(db));
  const full = priceKobo(kind, box.reward_kobo, { powerUps: money.powerUps });
  const { data: off } = await db.rpc("discount_for", {
    p_player_id: player.id,
    p_power_up: kind,
    p_box_id: box.id,
  });
  const discount = Math.max(0, Math.min(100, Number(off ?? 0)));
  const price = discountedKobo(full, discount);
  if (discount > 0) {
    await db.rpc("spend_discount", {
      p_player_id: player.id,
      p_power_up: kind,
      p_box_id: box.id,
    });
  }

  const split = box.contributor_id
    ? splitPowerUp(price, money.platformSharePercent)
    : { contributorKobo: 0, platformKobo: price };

  const reference = newReference("pu");
  const { error } = await db.from("power_up_orders").insert({
    reference,
    hunt_id: hunt.id,
    box_id: box.id,
    player_id: player.id,
    contributor_id: box.contributor_id,
    kind,
    price_kobo: price,
    contributor_kobo: split.contributorKobo,
    platform_kobo: split.platformKobo,
  });
  if (error) {
    console.error("[power-up] order insert failed:", error);
    return NextResponse.json({ error: "order_failed" }, { status: 500 });
  }

  const init = await initializeTransaction({
    email,
    amountKobo: price,
    reference,
    callbackUrl: `${appBaseUrl(req)}/b/${box.slug}?reference=${reference}`,
  });
  if (!init) {
    await db.from("power_up_orders").update({ status: "failed" }).eq("reference", reference);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }

  return NextResponse.json({ result: "redirect", authorizationUrl: init.authorizationUrl });
}
