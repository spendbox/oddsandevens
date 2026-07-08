import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAndSendCode } from "@/lib/verification";
import { EMAIL_REGEX } from "@/lib/constants";

// Signup step 1: email in, 6-digit code out (by Resend). Rejects an email that
// already has an account so we don't leak into a code flow for existing users.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const { data: existingId } = await supabaseAdmin().rpc(
    "auth_user_id_by_email",
    { p_email: email }
  );
  if (existingId) {
    return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }

  const sent = await createAndSendCode(email, "merchant_signup");
  if (!sent) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }
  return NextResponse.json({ ok: true });
}
