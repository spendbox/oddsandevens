import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  LIFE_PRICE_KOBO,
  MAX_FUNDING_KOBO,
  PLATFORM_SHARE_PERCENT,
} from "@/lib/constants";
import {
  isPowerUpKind,
  MIN_PRICE_KOBO,
  type PowerUpKind,
  type PriceOverrides,
} from "@/lib/game/power-ups";
import {
  DEFAULT_FUNDING_LADDER,
  FUNDING_STEPS,
  resolveLadder,
  type FundingLadder,
  type FundingOverrides,
} from "@/lib/game/rewards";

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
export function defaultPricing(): {
  platformSharePercent: number;
  lifePriceKobo: number;
  lifeBankKobo: number;
  funding: FundingLadder;
} {
  return {
    platformSharePercent: PLATFORM_SHARE_PERCENT,
    lifePriceKobo: LIFE_PRICE_KOBO,
    lifeBankKobo: LIFE_BANK_KOBO,
    funding: DEFAULT_FUNDING_LADDER,
  };
}

export async function loadPricing(db: Db): Promise<PriceOverrides> {
  const { data } = await db.rpc("pricing_settings");
  return sanitise(data);
}

/**
 * The funding ladder in force, for the routes and pages that quote or enforce
 * it. Every one of them reads it rather than importing a constant, so what the
 * Build screen prints is what the create route will accept.
 */
export async function loadFundingLadder(db: Db): Promise<FundingLadder> {
  return resolveLadder((await loadPricing(db)).funding);
}

/** Everything filled in: overrides where they exist, defaults everywhere else. */
export function resolved(prices: PriceOverrides | null | undefined) {
  const base = defaultPricing();
  return {
    platformSharePercent: prices?.platformSharePercent ?? base.platformSharePercent,
    lifePriceKobo: prices?.lifePriceKobo ?? base.lifePriceKobo,
    lifeBankKobo: prices?.lifeBankKobo ?? base.lifeBankKobo,
    powerUps: prices?.powerUps ?? {},
    funding: resolveLadder(prices?.funding),
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

  const funding = sanitiseFunding(value.funding);
  if (funding) out.funding = funding;

  return out;
}

/**
 * The contributor's floor, read out of the blob.
 *
 * The base is clamped like any other price — Paystack will not take a payment
 * below ₦100, and nothing may be quoted above the transfer cap, which is the
 * most that can ever be paid out. A *step* of zero is left alone, because "a
 * longer password costs no more" is a real answer somebody might want, and a
 * flat price per character is exactly how you would ask for it.
 */
function sanitiseFunding(raw: unknown): FundingOverrides | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const out: FundingOverrides = {};

  const base = num(value.baseKobo);
  if (base !== null) {
    out.baseKobo = clamp(Math.round(base), MIN_PRICE_KOBO, MAX_FUNDING_KOBO);
  }

  if (Array.isArray(value.stepsKobo)) {
    const steps: (number | null)[] = [];
    for (let i = 0; i < FUNDING_STEPS; i++) {
      const entry = value.stepsKobo[i];
      // `null` is how an untouched slot is stored, and it has to survive the
      // round trip: `Number(null)` is 0, which would silently flatten the
      // ladder rather than leave that step at its default.
      const step = entry === null || entry === undefined ? null : num(entry);
      steps.push(step === null ? null : clamp(Math.round(step), 0, MAX_FUNDING_KOBO));
    }
    if (steps.some((step) => step !== null)) out.stepsKobo = steps;
  }

  return out.baseKobo !== undefined || out.stepsKobo !== undefined ? out : null;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}
