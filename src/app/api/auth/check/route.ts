import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { EMAIL_REGEX } from "@/lib/constants";

// Email-first auth: tells the client whether an email already has an account,
// so the single "Start free" entry can branch to password login vs code signup.
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
  return NextResponse.json({ exists: !!existingId });
}
