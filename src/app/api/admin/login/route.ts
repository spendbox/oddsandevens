import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminCredentialsConfigured,
  adminSessionToken,
  checkAdminCredentials,
} from "@/lib/admin-auth";

const SESSION_MAX_AGE = 7 * 24 * 3600; // one week

// Admin login: checks the submitted email/password against the ADMIN_EMAIL /
// ADMIN_PASSWORD environment variables and sets the admin session cookie.
export async function POST(req: Request) {
  if (!adminCredentialsConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "");
  const password = String(body?.password ?? "");
  if (!checkAdminCredentials(email, password)) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, adminSessionToken()!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

// Admin logout: clear the session cookie.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
