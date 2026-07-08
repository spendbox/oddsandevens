import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyCode } from "@/lib/verification";
import { EMAIL_REGEX } from "@/lib/constants";

// Forgot password step 2: verify the code and set the new password. The client
// signs in with it afterwards.
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

  const ok = await verifyCode(email, "password_reset", code);
  if (!ok) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: userId } = await db.rpc("auth_user_id_by_email", {
    p_email: email,
  });
  if (!userId) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const { error } = await db.auth.admin.updateUserById(userId as string, {
    password,
  });
  if (error) {
    console.error("[password reset] update failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
