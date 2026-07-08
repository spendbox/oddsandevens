import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAndSendCode } from "@/lib/verification";
import { EMAIL_REGEX } from "@/lib/constants";

// Forgot password step 1: email a reset code, but only if an account exists.
// Always returns ok so the endpoint can't be used to probe which emails
// are registered.
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
    await createAndSendCode(email, "password_reset");
  }
  return NextResponse.json({ ok: true });
}
