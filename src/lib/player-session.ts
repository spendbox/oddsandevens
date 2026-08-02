// Who the player is, remembered by the browser rather than re-proved.
//
// Verifying an email used to be a per-visit ritual: the address lived in
// localStorage, but the server had no memory of it, so every game asked for a
// fresh 6-digit code. That is three emails a week for someone playing daily.
//
// So verification now mints a signed cookie. It carries the address and an
// expiry, signed with a server-side secret, which makes it two things at once:
// a memory (no more codes for six months) and a proof (a play can no longer be
// opened under someone else's address by typing it in). Nothing about the
// player is stored client-side that the server would have to trust.

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { EMAIL_REGEX } from "@/lib/constants";

export const PLAYER_COOKIE = "spendbox_player";

/** Six months: long enough that a regular never sees a code twice. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function secret(): string {
  // The service-role key is already the app's most privileged secret and is
  // never sent to a browser, so it doubles as the signing key unless one is
  // configured explicitly.
  return (
    process.env.PLAYER_SESSION_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ""
  );
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** "email|expiryMs|signature" — opaque to the browser, cheap to check. */
export function mintPlayerToken(email: string, now = Date.now()): string {
  const expires = now + MAX_AGE_SECONDS * 1000;
  const payload = `${email}|${expires}`;
  return `${payload}|${sign(payload)}`;
}

/** The address inside a token, or null if it is forged, stale or malformed. */
export function readPlayerToken(
  token: string | undefined | null,
  now = Date.now()
): string | null {
  if (!token) return null;
  const parts = token.split("|");
  if (parts.length !== 3) return null;
  const [email, expiresRaw, signature] = parts;
  if (!safeEqual(signature, sign(`${email}|${expiresRaw}`))) return null;
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < now) return null;
  if (!EMAIL_REGEX.test(email)) return null;
  return email;
}

/** The verified player behind this request, if the browser remembers one. */
export async function playerEmail(): Promise<string | null> {
  if (!secret()) return null;
  const store = await cookies();
  return readPlayerToken(store.get(PLAYER_COOKIE)?.value);
}

/** Called once, the moment an address is verified. */
export async function rememberPlayer(email: string): Promise<void> {
  if (!secret()) return;
  const store = await cookies();
  store.set(PLAYER_COOKIE, mintPlayerToken(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function forgetPlayer(): Promise<void> {
  const store = await cookies();
  store.delete(PLAYER_COOKIE);
}
