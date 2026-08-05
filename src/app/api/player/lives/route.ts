import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LIFE_PURCHASE_MAX } from "@/lib/constants";
import { playerEmail } from "@/lib/player-session";
import { appBaseUrl } from "@/lib/base-url";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";
import { ensurePlayer, newReference } from "@/lib/game/boxes";
import { splitSale } from "@/lib/game/rewards";
import { discountedKobo } from "@/lib/game/power-ups";
import { loadPricing, resolved } from "@/lib/game/pricing";
import { findBox } from "@/lib/game/view";

/**
 * Buy lives.
 *
 * Nobody has to: the pool refills an hour at a time whether or not anyone pays,
 * and this is only for players who don't want to wait.
 *
 * A life isn't attached to a box, but the *decision* to buy one almost always
 * is — somebody is three characters from cracking a particular safe and won't
 * wait an hour for the next guess. So the box they were looking at comes along
 * with the purchase, and its contributor takes 70% exactly as they would on a
 * power-up. The split is recorded on the order and paid out by hand from the
 * admin ledger; it is not routed by Paystack any more.
 *
 * With no box — bought from the player's own page — and on the platform's own
 * box, which has no contributor, the whole thing stays here.
 */
export async function POST(req: Request) {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });
  if (!paystackConfigured()) {
    return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    quantity?: number;
    slug?: string;
    /** True for a week of the raised ceiling rather than a count of lives. */
    lifeBank?: boolean;
  };
  const bank = body.lifeBank === true;
  const quantity = Math.trunc(Number(body.quantity ?? 0));
  if (!bank && (!Number.isFinite(quantity) || quantity < 1 || quantity > LIFE_PURCHASE_MAX)) {
    return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const money = resolved(await loadPricing(db));
  const player = await ensurePlayer(db, email);
  if (!player) return NextResponse.json({ error: "player_failed" }, { status: 500 });

  // An unknown slug is not an error — the lives are still real and still
  // bought. It just means nobody is credited.
  const box = body.slug ? await findBox(db, body.slug) : null;
  const contributorId = box?.contributor_id ?? null;

  // A claimed drop can take a share off, and that share is read from the
  // database rather than the request: a discount the client names is a discount
  // the client can name itself. It is burned immediately, against this order —
  // the checkout may still be abandoned, and a one-use coupon that survives an
  // abandoned checkout is a coupon that can be spent twice by abandoning once.
  // A Life Bank is a flat weekly price rather than a count of lives, and the
  // drop discount doesn't apply to it — a percentage off a subscription is a
  // different product from a percentage off a top-up, and only one of them
  // was ever offered.
  const full = bank ? money.lifeBankKobo : quantity * money.lifePriceKobo;
  const { data: off } = bank
    ? { data: 0 }
    : await db.rpc("life_discount_for", { p_player_id: player.id });
  const discount = Math.max(0, Math.min(100, Number(off ?? 0)));
  const priceKobo = discountedKobo(full, discount);
  if (discount > 0) {
    await db.rpc("spend_life_discount", { p_player_id: player.id });
  }

  // The split follows the discounted price, so a contributor's 70% is 70% of
  // what the player actually paid rather than of a number nobody paid.
  const split = contributorId
    ? splitSale(priceKobo, money.platformSharePercent)
    : { contributorKobo: 0, platformKobo: priceKobo };

  const reference = newReference(bank ? "bank" : "life");
  const { error } = await db.from("life_orders").insert({
    reference,
    player_id: player.id,
    // A bank buys no lives outright — the ceiling is the product, and the
    // top-up to it is applied by `grant_life_bank` at settlement.
    quantity: bank ? 0 : quantity,
    price_kobo: priceKobo,
    box_id: box?.id ?? null,
    contributor_id: contributorId,
    contributor_kobo: split.contributorKobo,
    platform_kobo: split.platformKobo,
  });
  if (error) {
    console.error("[lives] order insert failed:", error);
    return NextResponse.json({ error: "order_failed" }, { status: 500 });
  }

  // Back to wherever they were: a hunt interrupted by a checkout should
  // resume on the box, not on the account page.
  const callbackUrl = box
    ? `${appBaseUrl(req)}/b/${box.slug}?reference=${reference}`
    : `${appBaseUrl(req)}/me?reference=${reference}`;

  const init = await initializeTransaction({
    email,
    amountKobo: priceKobo,
    reference,
    callbackUrl,
  });
  if (!init) {
    await db.from("life_orders").update({ status: "failed" }).eq("reference", reference);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }

  return NextResponse.json({ result: "redirect", authorizationUrl: init.authorizationUrl });
}
