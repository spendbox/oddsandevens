import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LIFE_PRICE_KOBO, LIFE_PURCHASE_MAX } from "@/lib/constants";
import { playerEmail } from "@/lib/player-session";
import { appBaseUrl } from "@/lib/base-url";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";
import { ensurePlayer, newReference } from "@/lib/game/boxes";
import { splitSale } from "@/lib/game/rewards";
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
 * power-up. Paystack does the split at settlement against their subaccount, so
 * their share never sits in our balance waiting for someone to move it.
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
  };
  const quantity = Math.trunc(Number(body.quantity ?? 0));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > LIFE_PURCHASE_MAX) {
    return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const player = await ensurePlayer(db, email);
  if (!player) return NextResponse.json({ error: "player_failed" }, { status: 500 });

  // An unknown slug is not an error — the lives are still real and still
  // bought. It just means nobody is credited.
  const box = body.slug ? await findBox(db, body.slug) : null;
  const contributorId = box?.contributor_id ?? null;

  const priceKobo = quantity * LIFE_PRICE_KOBO;
  const split = contributorId
    ? splitSale(priceKobo)
    : { contributorKobo: 0, platformKobo: priceKobo };

  const subaccount = contributorId
    ? ((
        await db
          .from("contributors")
          .select("paystack_subaccount_code")
          .eq("id", contributorId)
          .maybeSingle()
      ).data?.paystack_subaccount_code as string | null) ?? null
    : null;

  const reference = newReference("life");
  const { error } = await db.from("life_orders").insert({
    reference,
    player_id: player.id,
    quantity,
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
    subaccount,
  });
  if (!init) {
    await db.from("life_orders").update({ status: "failed" }).eq("reference", reference);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }

  return NextResponse.json({ result: "redirect", authorizationUrl: init.authorizationUrl });
}
