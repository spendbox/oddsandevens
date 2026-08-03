import { NextResponse } from "next/server";
import { EMAIL_REGEX } from "@/lib/constants";
import { createAndSendCode } from "@/lib/verification";

/** Send a player a 6-digit code. Verification happens once, then a cookie
 * remembers them for six months — a prize needs somewhere to be sent. */
export async function POST(req: Request) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const addr = (email ?? "").trim().toLowerCase();
  if (!EMAIL_REGEX.test(addr)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const sent = await createAndSendCode(addr, "player_verify");
  if (!sent) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }
  return NextResponse.json({ result: "sent" });
}
