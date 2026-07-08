import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { settlePayment } from "@/lib/payments";

// Paystack server-to-server webhook. This is the reliable crediting path: even
// if the customer closes the tab before the browser redirect fires, Paystack
// POSTs `charge.success` here and we settle the payment. Configure the endpoint
// URL (https://spendbox.site/api/paystack/webhook) in the Paystack dashboard.
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
  if (e?.event === "charge.success") {
    const reference = String(e.data?.reference ?? "");
    if (/^th_[0-9a-f]{24}$/.test(reference)) {
      const settled = await settlePayment(reference);
      if (!settled.ok && settled.status >= 500) {
        // Let Paystack retry on a transient server error.
        return NextResponse.json({ error: settled.error }, { status: 500 });
      }
    }
  }

  // Acknowledge everything else so Paystack stops retrying.
  return NextResponse.json({ received: true });
}
