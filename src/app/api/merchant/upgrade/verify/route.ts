import { NextResponse } from "next/server";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import { settlePayment } from "@/lib/payments";

// Called by the dashboard when Paystack redirects back with ?payment_ref=.
// Verifies the transaction server-side, then credits premium time or top-up
// plays. This is a best-effort fast path — the Paystack webhook settles the
// same payment even if the customer never returns to this page.
export async function POST(req: Request) {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const reference = String(body?.reference ?? "").trim();
  if (!/^th_[0-9a-f]{24}$/.test(reference)) {
    return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
  }

  const settled = await settlePayment(reference, merchant.id);
  if (!settled.ok) {
    return NextResponse.json({ error: settled.error }, { status: settled.status });
  }
  return NextResponse.json({
    result: settled.result,
    plays: settled.plays,
    premiumExpiresAt: settled.premiumExpiresAt,
  });
}
