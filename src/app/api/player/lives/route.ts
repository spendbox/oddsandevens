import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LIFE_PRICE_KOBO, LIFE_PURCHASE_MAX } from "@/lib/constants";
import { playerEmail } from "@/lib/player-session";
import { appBaseUrl } from "@/lib/base-url";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";
import { ensurePlayer, newReference } from "@/lib/game/boxes";

/**
 * Buy lives.
 *
 * Nobody has to: the pool refills an hour at a time whether or not anyone
 * pays, and this is only for players who don't want to wait. A life isn't
 * attached to any particular box, so there is no contributor to share it with
 * and the whole ₦150 is platform revenue.
 */
export async function POST(req: Request) {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });
  if (!paystackConfigured()) {
    return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { quantity?: number };
  const quantity = Math.trunc(Number(body.quantity ?? 0));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > LIFE_PURCHASE_MAX) {
    return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const player = await ensurePlayer(db, email);
  if (!player) return NextResponse.json({ error: "player_failed" }, { status: 500 });

  const reference = newReference("life");
  const priceKobo = quantity * LIFE_PRICE_KOBO;
  const { error } = await db.from("life_orders").insert({
    reference,
    player_id: player.id,
    quantity,
    price_kobo: priceKobo,
  });
  if (error) {
    console.error("[lives] order insert failed:", error);
    return NextResponse.json({ error: "order_failed" }, { status: 500 });
  }

  const init = await initializeTransaction({
    email,
    amountKobo: priceKobo,
    reference,
    callbackUrl: `${appBaseUrl(req)}/me?reference=${reference}`,
  });
  if (!init) {
    await db.from("life_orders").update({ status: "failed" }).eq("reference", reference);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }

  return NextResponse.json({ result: "redirect", authorizationUrl: init.authorizationUrl });
}
