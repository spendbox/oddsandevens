import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyCode } from "@/lib/verification";
import { EMAIL_REGEX } from "@/lib/constants";

// Signup step 2: verify the code and create the account with the chosen
// password. The client signs in with the password afterwards.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const code = String(body?.code ?? "").trim();
  const password = String(body?.password ?? "");

  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }

  const ok = await verifyCode(email, "merchant_signup", code);
  if (!ok) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const { error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    if (/already|exist/i.test(error.message)) {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }
    console.error("[register] createUser failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
