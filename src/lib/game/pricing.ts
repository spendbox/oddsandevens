import { supabaseAdmin } from "@/lib/supabase/admin";
import { LIFE_PRICE_KOBO, PLATFORM_SHARE_PERCENT } from "@/lib/constants";
import {
  isPowerUpKind,
  MIN_PRICE_KOBO,
  type PowerUpKind,
  type PriceOverrides,
} from "@/lib/game/power-ups";

/**
 * What an admin has changed about prices, read at request time.
 *
 * The constants in `power-ups.ts` and `constants.ts` remain the defaults and
 * remain authoritative for anything nobody has touched — a missing row, an
 * empty object and an untouched key all behave identically to a build with no
 * settings at all. This only ever *overrides*.
 *
 * Everything is clamped here rather than trusted from the database. It is
 * admin-entered and therefore not hostile, but a share typed as `50` instead
 * of `0.5` would price a hint at fifty times the reward, and a floor of zero
 * would open a checkout Paystack refuses. Neither is worth a support ticket.
 */

/** A week of the raised life ceiling, before an admin changes it. */
export const LIFE_BANK_KOBO = 2_500 * 100;

type Db = ReturnType<typeof supabaseAdmin>;

/** The default of everything, so an admin screen has something to show. */
export function defaultPricing(): Required<Omit<PriceOverrides, "powerUps">> {
  return {
    platformSharePercent: PLATFORM_SHARE_PERCENT,
    lifePriceKobo: LIFE_PRICE_KOBO,
    lifeBankKobo: LIFE_BANK_KOBO,
  };
}

export async function loadPricing(db: Db): Promise<PriceOverrides> {
  const { data } = await db.rpc("pricing_settings");
  return sanitise(data);
}

/** Everything filled in: overrides where they exist, defaults everywhere else. */
export function resolved(prices: PriceOverrides | null | undefined) {
  const base = defaultPricing();
  return {
    platformSharePercent: prices?.platformSharePercent ?? base.platformSharePercent,
    lifePriceKobo: prices?.lifePriceKobo ?? base.lifePriceKobo,
    lifeBankKobo: prices?.lifeBankKobo ?? base.lifeBankKobo,
    powerUps: prices?.powerUps ?? {},
  };
}

/**
 * Read a blob of unknown shape into a `PriceOverrides`, dropping anything
 * that isn't a number in a sane range. Shared by the loader and by the admin
 * route that writes it, so what is stored is what will later be honoured.
 */
export function sanitise(raw: unknown): PriceOverrides {
  const value = (raw ?? {}) as Record<string, unknown>;
  const out: PriceOverrides = {};

  const percent = num(value.platformSharePercent);
  if (percent !== null) out.platformSharePercent = clamp(percent, 0, 90);

  const life = num(value.lifePriceKobo);
  if (life !== null) out.lifePriceKobo = clamp(Math.round(life), MIN_PRICE_KOBO, 1_000_000_00);

  const bank = num(value.lifeBankKobo);
  if (bank !== null) out.lifeBankKobo = clamp(Math.round(bank), MIN_PRICE_KOBO, 1_000_000_00);

  const powerUps = value.powerUps;
  if (powerUps && typeof powerUps === "object") {
    const kinds: PriceOverrides["powerUps"] = {};
    for (const [kind, spec] of Object.entries(powerUps as Record<string, unknown>)) {
      if (!isPowerUpKind(kind) || !spec || typeof spec !== "object") continue;
      const one = spec as Record<string, unknown>;
      const share = num(one.share);
      const floor = num(one.floorKobo);
      const entry: { share?: number; floorKobo?: number } = {};
      // A share is a fraction, never a percentage: 0.5 is half the reward and
      // is already absurd, so the ceiling is well under it.
      if (share !== null) entry.share = clamp(share, 0, 0.5);
      if (floor !== null) entry.floorKobo = clamp(Math.round(floor), MIN_PRICE_KOBO, 5_000_000_00);
      if (entry.share !== undefined || entry.floorKobo !== undefined) {
        kinds[kind as PowerUpKind] = entry;
      }
    }
    if (Object.keys(kinds).length > 0) out.powerUps = kinds;
  }

  return out;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}
