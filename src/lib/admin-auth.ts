import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

// Two ways to be a platform admin, both driven by environment variables
// (set these in Vercel → Project → Settings → Environment Variables):
//
//   1. ADMIN_EMAIL + ADMIN_PASSWORD — dedicated admin credentials. /admin has
//      its own login form; a successful login sets an HTTP-only cookie whose
//      value is a hash of the configured credentials, so rotating either env
//      var invalidates every admin session.
//   2. ADMIN_EMAILS (comma-separated) — optional fallback: any logged-in
//      Supabase user whose email is on the list.

export const ADMIN_COOKIE = "th_admin";

export function adminCredentialsConfigured(): boolean {
  return !!process.env.ADMIN_EMAIL && !!process.env.ADMIN_PASSWORD;
}

// The cookie token: derived from the configured credentials, never stores
// the password itself.
export function adminSessionToken(): string | null {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return null;
  return createHash("sha256")
    .update(`tilehunt-admin\n${email.toLowerCase()}\n${password}`)
    .digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Check a login attempt against the configured env credentials.
export function checkAdminCredentials(email: string, password: string): boolean {
  const cfgEmail = process.env.ADMIN_EMAIL;
  const cfgPassword = process.env.ADMIN_PASSWORD;
  if (!cfgEmail || !cfgPassword) return false;
  return (
    safeEqual(email.trim().toLowerCase(), cfgEmail.toLowerCase()) &&
    safeEqual(password, cfgPassword)
  );
}

export async function getAdminUser(): Promise<{ email: string } | null> {
  // 1. Dedicated admin session cookie (ADMIN_EMAIL + ADMIN_PASSWORD).
  const expected = adminSessionToken();
  if (expected) {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE)?.value;
    if (token && safeEqual(token, expected)) {
      return { email: process.env.ADMIN_EMAIL!.toLowerCase() };
    }
  }

  // 2. Fallback: Supabase-authenticated user on the ADMIN_EMAILS list.
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return null;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !allowed.includes(email)) return null;
  return { email };
}
