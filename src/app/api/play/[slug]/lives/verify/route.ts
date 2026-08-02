import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { verifyTransaction } from "@/lib/paystack";

// Confirms a life purchase after Paystack sends the player back.
//
// The credit itself is done by `credit_life_purchase`, which is idempotent on
// the reference: this endpoint can be called twice (a reload, a double tap)
// and the player is credited once. Money is never taken on our word — the
// reference is checked against Paystack before anything is granted.
export async function POST(req: Request) {
  const email = await playerEmail();
  if (!email) {
    return NextResponse.json({ error: "email_not_verified" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const reference = String(body?.reference ?? "").trim();
  if (!/^sbl_[a-f0-9]{24}$/.test(reference)) {
    return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: purchase } = await db
    .from("life_purchases")
    .select("id, status, lives, customer_id, customers(email)")
    .eq("reference", reference)
    .maybeSingle();
  if (!purchase) {
    return NextResponse.json({ error: "unknown_reference" }, { status: 404 });
  }

  // A reference belongs to the player who started it.
  const owner = (purchase.customers as unknown as { email: string } | null)?.email;
  if (owner && owner !== email) {
    return NextResponse.json({ error: "not_your_purchase" }, { status: 403 });
  }

  if (purchase.status === "paid") {
    return NextResponse.json({ result: "credited", lives: purchase.lives });
  }

  const payment = await verifyTransaction(reference);
  if (!payment) {
    return NextResponse.json({ error: "verify_failed" }, { status: 502 });
  }
  if (!payment.success) {
    // Still pending at Paystack's end: leave the row alone so a later check
    // can still credit it.
    if (payment.status === "abandoned" || payment.status === "failed") {
      await db
        .from("life_purchases")
        .update({ status: "failed" })
        .eq("id", purchase.id);
      return NextResponse.json({ result: "failed" });
    }
    return NextResponse.json({ result: "pending" });
  }

  const { data, error } = await db.rpc("credit_life_purchase", {
    p_reference: reference,
  });
  if (error) {
    console.error("[lives] credit failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  const result = data as { result: string; lives?: number };
  return NextResponse.json({
    result: result.result === "error" ? "failed" : "credited",
    lives: Number(result.lives ?? purchase.lives),
  });
}
