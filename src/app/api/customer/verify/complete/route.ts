import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyCode } from "@/lib/verification";
import { rememberPlayer } from "@/lib/player-session";
import { EMAIL_REGEX } from "@/lib/constants";

// Customer email verification step 2: check the code and mark the customer's
// email verified so the play endpoint will accept their taps.
//
// This is also where the browser stops having to ask: a signed cookie goes
// back with the response, and it is what identifies the player from here on.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const code = String(body?.code ?? "").trim();

  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const ok = await verifyCode(email, "customer_verify", code);
  if (!ok) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const { error } = await supabaseAdmin()
    .from("customers")
    .upsert({ email, email_verified: true }, { onConflict: "email" });
  if (error) {
    console.error("[customer verify] upsert failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  await rememberPlayer(email);
  return NextResponse.json({ ok: true });
}
