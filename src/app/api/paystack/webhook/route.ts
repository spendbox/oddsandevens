import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  markFailed,
  orderTableFor,
  settleLives,
  settlePowerUp,
  settleFunding,
} from "@/lib/game/settle";

// Paystack server-to-server webhook: the reliable crediting path. Even if the
// player closes the tab before the browser redirect fires, Paystack POSTs
// `charge.success` here and the order settles. Configure the endpoint URL
// (https://spendbox.site/api/paystack/webhook) in the Paystack dashboard.
//
// The raw body is required to verify the signature, so we read text() (not
// json()) and hash it with the secret key.
export async function POST(req: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    // Payments aren't configured; nothing to do. 200 so Paystack won't retry.
    return NextResponse.json({ received: true });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", secret).update(raw).digest("hex");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const e = event as { event?: string; data?: { reference?: string } };
  const reference = String(e?.data?.reference ?? "");
  const table = orderTableFor(reference);

  if (table && (e.event === "charge.success" || e.event === "charge.failed")) {
    try {
      if (e.event === "charge.failed") {
        await markFailed(supabaseAdmin(), table, reference);
      } else if (table === "power_up_orders") {
        await settlePowerUp(supabaseAdmin(), reference);
      } else if (table === "life_orders") {
        await settleLives(supabaseAdmin(), reference);
      } else {
        await settleFunding(supabaseAdmin(), reference);
      }
    } catch (err) {
      // Let Paystack retry rather than silently dropping a paid order.
      console.error("[webhook] settle failed:", err);
      return NextResponse.json({ error: "settle_failed" }, { status: 500 });
    }
  }

  // Acknowledge everything else so Paystack stops retrying.
  return NextResponse.json({ received: true });
}
