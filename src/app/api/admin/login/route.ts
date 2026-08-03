import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminCredentialsConfigured,
  adminSessionToken,
  checkAdminCredentials,
} from "@/lib/admin-auth";

/** Sign in to /admin with the credentials configured in the environment. */
export async function POST(req: Request) {
  if (!adminCredentialsConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  if (!checkAdminCredentials(body.email ?? "", body.password ?? "")) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const token = adminSessionToken();
  if (!token) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const res = NextResponse.json({ result: "signed_in" });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}

/** Sign out. */
export async function DELETE() {
  const res = NextResponse.json({ result: "signed_out" });
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
