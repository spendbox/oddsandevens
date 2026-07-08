import { NextResponse } from "next/server";
import { createAndSendCode } from "@/lib/verification";
import { EMAIL_REGEX } from "@/lib/constants";

// Customer email verification step 1: email a code the player enters before
// they can win or redeem.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const sent = await createAndSendCode(email, "customer_verify");
  if (!sent) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }
  return NextResponse.json({ ok: true });
}
