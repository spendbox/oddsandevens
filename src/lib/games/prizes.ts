// Validation for the prize slots a builder submits. Kept out of the route
// module because Next.js only allows HTTP handlers to be exported from one.

import { REWARD_ICON_SLUGS } from "@/lib/constants";
import { MAX_PRIZE_SLOTS } from "./catalog";
import type { PrizeDraft } from "./types";

/**
 * Returns the cleaned slots, or null if anything was malformed. Blanks (the
 * losing segments of a chance game) carry no stock and never mint a code.
 */
export function parsePrizes(raw: unknown): PrizeDraft[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_PRIZE_SLOTS) return null;

  const out: PrizeDraft[] = [];
  for (const item of raw) {
    const p = item as Record<string, unknown> | null;
    const description = String(p?.description ?? "").trim();
    if (description.length < 1 || description.length > 200) return null;
    const details = String(p?.details ?? "").trim();
    if (details.length > 300) return null;
    const rawIcon = String(p?.icon ?? "").trim();
    // Unknown slugs are dropped rather than rejected — the icon is decorative.
    const icon = (REWARD_ICON_SLUGS as readonly string[]).includes(rawIcon)
      ? rawIcon
      : null;

    const kind = p?.kind === "blank" ? "blank" : "prize";
    const expiryDays = Number(p?.expiry_days ?? 30);
    const stock = Number(p?.stock ?? 1);
    const weight = Number(p?.weight ?? 1);
    const minScore = Number(p?.min_score ?? 0);
    if (
      !Number.isFinite(expiryDays) ||
      !Number.isFinite(stock) ||
      !Number.isFinite(weight) ||
      !Number.isFinite(minScore)
    ) {
      return null;
    }

    out.push({
      kind,
      description,
      details: details || null,
      icon,
      expiry_days: Math.min(Math.max(Math.round(expiryDays), 1), 60),
      stock: kind === "blank" ? 0 : Math.min(Math.max(Math.round(stock), 1), 100000),
      weight: Math.min(Math.max(Math.round(weight), 0), 10000),
      min_score: Math.min(Math.max(Math.round(minScore), 0), 100000000),
    });
  }
  return out;
}
