import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MAX_FUNDING_KOBO } from "@/lib/constants";
import { getAuthedContributor } from "@/lib/contributor-auth";
import { appBaseUrl } from "@/lib/base-url";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";
import { newReference } from "@/lib/game/boxes";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Put money behind a box.
 *
 * Two shapes, one route:
 *
 *  - A **draft** gets funded and goes live. The whole amount is collected up
 *    front so a winner is never waiting on a contributor to be good for it.
 *  - A **live** box gets its reward raised. Only the difference is charged,
 *    and only upwards — a player deciding a box is worth weeks of lives has to
 *    be able to trust the number they read, so the reward can never fall.
 *
 * 70% of whatever is collected becomes the reward; Spendbox keeps 30%.
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

  const body = (await req.json().catch(() => ({}))) as { raiseToKobo?: number };
  const raiseTo = body.raiseToKobo ? Math.trunc(Number(body.raiseToKobo)) : null;

  const db = supabaseAdmin();
  const { data: box } = await db
    .from("boxes")
    .select("id, slug, title, status, funding_kobo")
    .eq("id", id)
    .eq("contributor_id", contributor.id)
    .maybeSingle();

  if (!box) return NextResponse.json({ error: "box_not_found" }, { status: 404 });

  const current = Number(box.funding_kobo);
  let chargeKobo: number;
  let raisesTo: number | null = null;

  if (raiseTo !== null) {
    if (box.status !== "live" && box.status !== "funding") {
      return NextResponse.json({ error: "box_not_open" }, { status: 409 });
    }
    if (!Number.isSafeInteger(raiseTo) || raiseTo <= current || raiseTo > MAX_FUNDING_KOBO) {
      return NextResponse.json(
        { error: "not_an_increase", currentKobo: current, maxKobo: MAX_FUNDING_KOBO },
        { status: 400 }
      );
    }
    chargeKobo = raiseTo - current;
    raisesTo = raiseTo;
  } else {
    if (box.status === "live") return NextResponse.json({ result: "already_live" });
    if (box.status !== "draft" && box.status !== "funding") {
      return NextResponse.json({ error: "box_not_fundable" }, { status: 409 });
    }
    chargeKobo = current;
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // A draft moves to 'funding' the moment checkout opens, which also stops it
  // being edited out from under a payment that's already in flight.
  if (raisesTo === null && box.status === "draft") {
    await db.from("boxes").update({ status: "funding" }).eq("id", box.id);
  }

  const reference = newReference("fund");
  const { error } = await db.from("funding_orders").insert({
    reference,
    box_id: box.id,
    contributor_id: contributor.id,
    amount_kobo: chargeKobo,
    raises_to_kobo: raisesTo,
  });
  if (error) {
    console.error("[fund] order insert failed:", error);
    return NextResponse.json({ error: "order_failed" }, { status: 500 });
  }

  // No subaccount here: funding is money coming *in* to back a reward, not a
  // sale to be split.
  const init = await initializeTransaction({
    email: user.email,
    amountKobo: chargeKobo,
    reference,
    callbackUrl: `${appBaseUrl(req)}/dashboard?reference=${reference}`,
  });
  if (!init) {
    await db.from("funding_orders").update({ status: "failed" }).eq("reference", reference);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }

  return NextResponse.json({ result: "redirect", authorizationUrl: init.authorizationUrl });
}
