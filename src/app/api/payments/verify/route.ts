import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isTerminalFailure, paystackConfigured, verifyTransaction } from "@/lib/paystack";
import {
  markFailed,
  orderTableFor,
  settleLives,
  settlePowerUp,
  settleFunding,
} from "@/lib/game/settle";

/**
 * Settle the payment a player or contributor has just come back from.
 *
 * Paystack's webhook is the source of truth, but it can land seconds after the
 * browser does, and staring at a spinner is a poor reward for having just
 * paid. So the return trip verifies the reference directly and settles it, and
 * the webhook finds the work already done.
 *
 * The reference's prefix says which kind of order it is; the row itself is
 * looked up by reference alone, which is unguessable and single-use.
 */
export async function POST(req: Request) {
  const { reference } = (await req.json().catch(() => ({}))) as { reference?: string };
  if (!reference) return NextResponse.json({ error: "no_reference" }, { status: 400 });
  if (!paystackConfigured()) {
    return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  }

  const table = orderTableFor(reference);
  if (!table) return NextResponse.json({ error: "unknown_reference" }, { status: 400 });

  const db = supabaseAdmin();
  const verified = await verifyTransaction(reference);
  if (!verified) return NextResponse.json({ error: "verify_failed" }, { status: 502 });

  if (!verified.success) {
    // Anything that isn't terminal is still in flight — leave it pending and
    // let the webhook have the last word.
    if (isTerminalFailure(verified.status)) await markFailed(db, table, reference);
    return NextResponse.json({ result: verified.status });
  }

  if (table === "power_up_orders") {
    const { settled, note } = await settlePowerUp(db, reference);
    return NextResponse.json({ result: settled ? "paid" : "unknown", note });
  }
  if (table === "life_orders") {
    const { settled, quantity } = await settleLives(db, reference);
    return NextResponse.json({ result: settled ? "paid" : "unknown", quantity });
  }

  const { settled } = await settleFunding(db, reference);
  return NextResponse.json({ result: settled ? "paid" : "unknown" });
}
