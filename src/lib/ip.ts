import { createHash } from "node:crypto";

// Hash of the caller's IP for the per-IP play cooldown. Only the hash is
// stored (salted via IP_HASH_SALT when set). Returns null when no client IP
// is available (e.g. local dev without a proxy) — play then degrades to the
// email-only cooldown.
export function clientIpHash(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  if (!ip) return null;
  return createHash("sha256")
    .update(ip + (process.env.IP_HASH_SALT ?? ""))
    .digest("hex");
}
