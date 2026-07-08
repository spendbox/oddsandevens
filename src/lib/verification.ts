import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendVerificationCodeEmail } from "@/lib/email";

export type CodePurpose =
  | "merchant_signup"
  | "password_reset"
  | "customer_verify";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const MAX_PER_HOUR = 5;

function hashCode(email: string, code: string): string {
  // Bind the hash to the email so a leaked code can't be reused elsewhere.
  return createHash("sha256").update(`${email.toLowerCase()}\n${code}`).digest("hex");
}

function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// Generate a code, store its hash, and email it. Returns false when the caller
// has requested too many codes recently (basic anti-abuse).
export async function createAndSendCode(
  email: string,
  purpose: CodePurpose
): Promise<boolean> {
  const addr = email.trim().toLowerCase();
  const db = supabaseAdmin();

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await db
    .from("verification_codes")
    .select("id", { count: "exact", head: true })
    .eq("email", addr)
    .eq("purpose", purpose)
    .gte("created_at", hourAgo);
  if ((count ?? 0) >= MAX_PER_HOUR) return false;

  const code = newCode();
  const { error } = await db.from("verification_codes").insert({
    email: addr,
    purpose,
    code_hash: hashCode(addr, code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) {
    console.error("[verification] insert failed:", error);
    return false;
  }

  await sendVerificationCodeEmail({ to: addr, code, purpose });
  return true;
}

// Check a code for an email + purpose. On success the code (and any siblings)
// are consumed so it can't be replayed.
export async function verifyCode(
  email: string,
  purpose: CodePurpose,
  code: string
): Promise<boolean> {
  const addr = email.trim().toLowerCase();
  if (!/^\d{6}$/.test(code)) return false;
  const db = supabaseAdmin();

  const { data: row } = await db
    .from("verification_codes")
    .select("id, code_hash, expires_at, attempts")
    .eq("email", addr)
    .eq("purpose", purpose)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return false;

  if (
    new Date(row.expires_at).getTime() < Date.now() ||
    row.attempts >= MAX_ATTEMPTS
  ) {
    return false;
  }

  const expected = Buffer.from(row.code_hash);
  const actual = Buffer.from(hashCode(addr, code));
  const ok = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!ok) {
    await db
      .from("verification_codes")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    return false;
  }

  // Consume every outstanding code for this email + purpose.
  await db
    .from("verification_codes")
    .delete()
    .eq("email", addr)
    .eq("purpose", purpose);
  return true;
}
