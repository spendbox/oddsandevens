import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminCredentialsConfigured,
  adminSessionToken,
  checkAdminCredentials,
} from "@/lib/admin-auth";
import { callerKey, tooMany } from "@/lib/rate-limit";

/** Ten tries a quarter of an hour. A person who knows the password needs two. */
const TRIES = 10;
const WINDOW_MS = 15 * 60_000;

/** Sign in to /admin with the credentials configured in the environment. */
export async function POST(req: Request) {
  if (!adminCredentialsConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // This is the one door on the site with a password behind it and no second
  // factor, and it was answering as fast as it could be asked.
  if (tooMany(callerKey(req, "admin-login"), TRIES, WINDOW_MS)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
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
