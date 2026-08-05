// Where an account came from, and how many are allowed to come from there.
//
// The cheapest attack on a large safe is clerical rather than clever: an
// address is seven free lives and one an hour, so a 26-character password —
// about 1,900 attempts — is roughly 270 throwaway inboxes and a fortnight of
// patience. Nothing noticed, because nothing knew that two accounts had
// arrived from the same place.
//
// So every account is now stamped, once, with a salted hash of the address it
// was created from. Two things follow, and only the first is switched on:
//
//   **Recording** is unconditional. It costs one column and one write per
//   account ever, and it is what makes the question answerable at all.
//
//   **The cap** ships at zero, which means off. Carrier NAT in Nigeria puts
//   very large numbers of real players behind single addresses, so a limit
//   picked by guesswork would lock out a whole network to stop one farmer.
//   The admin screen shows what the clusters actually look like; a number
//   chosen from that is a number worth enforcing, and it takes one field.
//
// Only a *new* account is ever refused. Somebody who already has one signs in
// from anywhere, forever, whatever the cap says — the limit is on creation,
// which is the thing being farmed.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { clientIpHash } from "@/lib/ip";

type Db = ReturnType<typeof supabaseAdmin>;

export interface Limits {
  /** New accounts one address may create in 24 hours. Zero means no limit. */
  newAccountsPerIpPerDay: number;
}

/** Nothing enforced. See the note above for why this is the default. */
export function defaultLimits(): Limits {
  return { newAccountsPerIpPerDay: 0 };
}

/** No more than this, whatever is stored — a typo shouldn't close the door. */
const MAX_CAP = 10_000;

export function sanitiseLimits(raw: unknown): Limits {
  const source = (raw ?? {}) as Record<string, unknown>;
  const asked = Math.trunc(Number(source.newAccountsPerIpPerDay ?? 0));
  return {
    newAccountsPerIpPerDay: Number.isFinite(asked)
      ? Math.min(Math.max(asked, 0), MAX_CAP)
      : 0,
  };
}

export async function loadLimits(db: Db): Promise<Limits> {
  const { data } = await db.rpc("limit_settings");
  return sanitiseLimits(data);
}

/**
 * May this address create another account right now?
 *
 * Called *before* the verification code is checked, deliberately. Refusing
 * after the code has been consumed would burn somebody's code to tell them no,
 * and the answer doesn't depend on the code — only on whether the account
 * already exists and how busy the address has been.
 */
export async function newAccountAllowed(
  db: Db,
  req: Request,
  email: string
): Promise<boolean> {
  const ip = clientIpHash(req);
  if (!ip) return true;

  // An existing player is signing in, not signing up. Never gated.
  const { data: existing } = await db
    .from("players")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) return true;

  const { newAccountsPerIpPerDay: cap } = await loadLimits(db);
  if (cap <= 0) return true;

  const { data: made } = await db.rpc("accounts_from_ip", {
    p_ip_hash: ip,
    p_hours: 24,
  });
  return Number(made ?? 0) < cap;
}

/**
 * Stamp a freshly created account with where it came from.
 *
 * Safe to call on every sign-in: the function behind it only writes when the
 * column is still null, so the record stays a record of *creation* rather than
 * drifting to wherever somebody last opened the site.
 */
export async function stampSignupIp(
  db: Db,
  req: Request,
  playerId: string
): Promise<void> {
  const ip = clientIpHash(req);
  if (!ip) return;
  await db.rpc("record_signup_ip", { p_player_id: playerId, p_ip_hash: ip });
}
