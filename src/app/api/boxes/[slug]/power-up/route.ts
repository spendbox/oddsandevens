import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { appBaseUrl } from "@/lib/base-url";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";
import { newReference } from "@/lib/game/boxes";
import {
  isAvailable,
  isPowerUpKind,
  parseRevealed,
  priceKobo,
  splitPowerUp,
} from "@/lib/game/power-ups";
import { findBox, findHunt } from "@/lib/game/view";

/**
 * Buy a power-up for the hunt in progress.
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
  const price = priceKobo(kind, box.reward_kobo);
  const split = box.contributor_id
    ? splitPowerUp(price)
    : { contributorKobo: 0, platformKobo: price };

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
    subaccount,
  });
  if (!init) {
    await db.from("power_up_orders").update({ status: "failed" }).eq("reference", reference);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }

  return NextResponse.json({ result: "redirect", authorizationUrl: init.authorizationUrl });
}
