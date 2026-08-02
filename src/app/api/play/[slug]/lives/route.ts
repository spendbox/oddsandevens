import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";
import { appBaseUrl } from "@/lib/base-url";
import {
  DEFAULT_LIFE_TOPUP_LIVES,
  DEFAULT_LIFE_TOPUP_PRICE_KOBO,
} from "@/lib/constants";

// Buying more plays.
//
// A player gets three a week from the business for nothing. If they want more
// than that, they can buy a block for the current week — which is the only
// thing on this platform a *player* ever pays for, and it is optional in the
// strict sense: the free three are enough to reach the top of a board, and
// bought lives buy attempts, never an advantage within a round.
//
// The price and block size live in app_settings so they can be changed without
// a deploy.

async function topupTerms(db: ReturnType<typeof supabaseAdmin>) {
  const { data } = await db
    .from("app_settings")
    .select("key, value")
    .in("key", ["life_topup_price_kobo", "life_topup_lives"]);
  const read = (key: string, fallback: number) => {
    const row = (data ?? []).find((r) => r.key === key);
    const value = Number(row?.value ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    amountKobo: read("life_topup_price_kobo", DEFAULT_LIFE_TOPUP_PRICE_KOBO),
    lives: read("life_topup_lives", DEFAULT_LIFE_TOPUP_LIVES),
  };
}

/** What a top-up costs and how many plays it buys. */
export async function GET() {
  const db = supabaseAdmin();
  const terms = await topupTerms(db);
  return NextResponse.json({ ...terms, paymentsEnabled: paystackConfigured() });
}

/** Start a checkout. The lives land only when the payment is verified. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const email = await playerEmail();
  if (!email) {
    return NextResponse.json({ error: "email_not_verified" }, { status: 403 });
  }
  if (!paystackConfigured()) {
    return NextResponse.json(
      { error: "payments_not_configured" },
      { status: 503 }
    );
  }

  const db = supabaseAdmin();
  const { data: merchant } = await db
    .from("merchants")
    .select("id, slug, paystack_subaccount_code")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (!merchant) {
    return NextResponse.json({ error: "merchant_not_found" }, { status: 404 });
  }

  const { data: customer } = await db
    .from("customers")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!customer) {
    return NextResponse.json({ error: "unknown_player" }, { status: 404 });
  }

  const terms = await topupTerms(db);
  const { data: week } = await db.rpc("week_start");
  const reference = `sbl_${randomBytes(12).toString("hex")}`;

  // Which game they were on when they decided to buy. The hub sends no
  // `back`, and a hub purchase belongs to no single game.
  const back = new URL(req.url).searchParams.get("back") ?? "";
  const { data: fromGame } = back
    ? await db
        .from("games")
        .select("id")
        .eq("merchant_id", merchant.id)
        .eq("slug", back.toLowerCase())
        .maybeSingle()
    : { data: null };

  const { error } = await db.from("life_purchases").insert({
    merchant_id: merchant.id,
    customer_id: customer.id,
    week,
    reference,
    amount_kobo: terms.amountKobo,
    lives: terms.lives,
    game_id: fromGame?.id ?? null,
  });
  if (error) {
    console.error("[lives] purchase insert failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  // Paystack sends the player back to the game they were on; the page verifies
  // the reference on arrival.
  const origin = appBaseUrl(req);
  const callbackUrl = `${origin}/p/${merchant.slug}${
    back ? `/${encodeURIComponent(back)}` : ""
  }?life_ref=${reference}`;

  const checkout = await initializeTransaction({
    email,
    amountKobo: terms.amountKobo,
    reference,
    callbackUrl,
    // The split happens at Paystack: the business's share settles to their
    // bank and never passes through our balance.
    subaccount: merchant.paystack_subaccount_code,
  });
  if (!checkout) {
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }

  return NextResponse.json({
    authorizationUrl: checkout.authorizationUrl,
    ...terms,
  });
}
