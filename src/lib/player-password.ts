// Hashing a player's password.
//
// scrypt from `node:crypto` rather than bcrypt or argon2, for one reason: it is
// already here. A password hash is a dependency you cannot casually upgrade —
// every stored hash has to survive it — so the fewer packages standing between
// the app and the primitive, the better.
//
// The stored form carries its own parameters:
//
//   scrypt$16384$8$1$<salt-b64url>$<hash-b64url>
//
// which means the cost can be raised later without invalidating anybody: an old
// hash still verifies against the parameters it was written with, and gets
// rewritten at the next successful sign-in. `needsRehash` is what tells the
// caller that.

import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

/**
 * `promisify` loses the options overload, so the wrapper is written by hand.
 * Options are not optional here — the cost parameters are the point.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

/** Current parameters. Raising N is safe; lowering it is not. */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/** Short enough that nobody is locked out, long enough to be worth having. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

export function passwordIsValid(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    // scrypt's default maxmem is 32MB; N=16384, r=8 needs a shade over that.
    maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

/**
 * Check a password against a stored hash.
 *
 * Returns false for every kind of failure — wrong password, malformed hash,
 * an account with no password at all — because the caller must not be able to
 * tell those apart, and neither must anybody watching the caller.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltRaw, keyRaw] = parts;
  try {
    const salt = Buffer.from(saltRaw, "base64url");
    const expected = Buffer.from(keyRaw, "base64url");
    const key = await scrypt(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 256 * 1024 * 1024,
    });
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/** True when a hash was written with weaker parameters than we now use. */
export function needsRehash(stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return Number(parts[1]) < N;
}
