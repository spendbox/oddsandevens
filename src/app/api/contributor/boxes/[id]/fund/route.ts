import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedContributor } from "@/lib/contributor-auth";
import { appBaseUrl } from "@/lib/base-url";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";
import { newReference } from "@/lib/game/boxes";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Pay the stake and put the box up.
 *
 * The stake is the prize: 70% of it is what a player is chasing and 30% is
 * what Spendbox keeps for running the box. It's collected in full up front so
 * that a winner is never waiting on a contributor to be good for it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, contributor } = await getAuthedContributor();
  if (!userId || !contributor) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!paystackConfigured()) {
    return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  }

  const db = supabaseAdmin();
  const { data: box } = await db
    .from("boxes")
    .select("id, slug, title, status, stake_kobo")
    .eq("id", id)
    .eq("contributor_id", contributor.id)
    .maybeSingle();

  if (!box) return NextResponse.json({ error: "box_not_found" }, { status: 404 });
  if (box.status === "live") return NextResponse.json({ result: "already_live" });
  if (box.status !== "funding") {
    return NextResponse.json({ error: "box_not_fundable" }, { status: 409 });
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const reference = newReference("stake");
  const { error } = await db.from("stake_orders").insert({
    reference,
    box_id: box.id,
    contributor_id: contributor.id,
    amount_kobo: box.stake_kobo,
  });
  if (error) {
    console.error("[fund] order insert failed:", error);
    return NextResponse.json({ error: "order_failed" }, { status: 500 });
  }

  // No subaccount here: a stake is money coming *in* to fund a prize, not a
  // sale to be split.
  const init = await initializeTransaction({
    email: user.email,
    amountKobo: Number(box.stake_kobo),
    reference,
    callbackUrl: `${appBaseUrl(req)}/dashboard?reference=${reference}`,
  });
  if (!init) {
    await db.from("stake_orders").update({ status: "failed" }).eq("reference", reference);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }

  return NextResponse.json({ result: "redirect", authorizationUrl: init.authorizationUrl });
}
