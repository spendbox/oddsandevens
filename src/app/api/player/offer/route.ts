import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { POWER_UP_KINDS } from "@/lib/game/power-ups";
import { findBox } from "@/lib/game/view";
import type { Drop } from "@/lib/types";

/**
 * Drops: the things that fall out of the sky mid-hunt.
 *
 * Two actions. `mint` asks for one — the browser is the thing that notices the
 * moment (a player down to their last life, or five guesses that went nowhere)
 * because the browser is the only thing watching. `claim` takes it.
 *
 * What the browser explicitly does *not* get to do is say what the offer is.
 * It asks; the server decides. Every generous kind is capped in SQL — one
 * free-lives popup an hour and five taken a day, one free Second Wind a week —
 * and `mint_offer` returns nothing at all when a cap says no.
 *
 * Which is why this asks down a *ladder* rather than once. A player who has
 * had their free lives for the hour should still see the occasional discount;
 * silence is the correct answer only when nothing at all may be given.
 */

/** The most lives one drop ever gives. The daily ceiling is in the migration. */
const MAX_FREE_LIVES = 3;
const MAX_DISCOUNT = 50;
/** How long an *unclaimed* one hangs around. A claimed discount restarts it. */
const MINUTES = 10;

type Ask = {
  kind: Drop["kind"];
  amount: number;
  powerUp: string | null;
};

export async function POST(req: Request) {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    slug?: string;
    offerId?: string;
    /** Which the browser would *like*. Advisory; the server picks the terms. */
    kind?: string;
    powerUp?: string;
  };

  const db = supabaseAdmin();

  if (body.action === "claim") {
    if (!body.offerId) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const { data } = await db.rpc("claim_offer", {
      p_email: email,
      p_offer_id: body.offerId,
    });
    const result = (data ?? {}) as { result?: string; error?: string; lives?: number };
    if (result.result !== "claimed") {
      return NextResponse.json({ error: result.error ?? "offer_gone" }, { status: 409 });
    }
    return NextResponse.json(result);
  }

  if (body.action !== "mint") {
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }

  const box = body.slug ? await findBox(db, body.slug) : null;
  const boxId = box?.id ?? null;

  // A discount needs a power-up to be about — an offer that applies to
  // whatever you happen to buy next is a coupon, and a coupon gets spent on
  // the most expensive thing on the shelf.
  const named = POWER_UP_KINDS.includes(body.powerUp as (typeof POWER_UP_KINDS)[number]);

  const discount: Ask | null =
    box && named
      ? {
          kind: "power_up_discount",
          amount: pick([20, 25, 30, 40, MAX_DISCOUNT]),
          powerUp: body.powerUp!,
        }
      : null;
  const lives: Ask = {
    kind: "free_lives",
    amount: pick([1, 2, MAX_FREE_LIVES]),
    powerUp: null,
  };
  const wind: Ask | null = box
    ? { kind: "free_second_wind", amount: 1, powerUp: null }
    : null;

  // What was asked for first, then whatever else is still allowed.
  const ladder: Ask[] = [];
  if (body.kind === "free_second_wind" && wind) ladder.push(wind);
  if (body.kind === "power_up_discount" && discount) ladder.push(discount);
  if (body.kind === "free_lives") ladder.push(lives);
  if (discount) ladder.push(discount);
  ladder.push(lives);

  const seen = new Set<string>();
  for (const ask of ladder) {
    if (seen.has(ask.kind)) continue;
    seen.add(ask.kind);

    const { data } = await db.rpc("mint_offer", {
      p_email: email,
      p_kind: ask.kind,
      p_amount: ask.amount,
      p_power_up: ask.powerUp,
      p_box_id: boxId,
      p_minutes: MINUTES,
    });

    const row = (Array.isArray(data) ? data[0] : data) as {
      id: string | null;
      kind: Drop["kind"];
      amount: number;
      power_up: string | null;
      expires_at: string;
    } | null;

    // A capped kind comes back as SQL NULL, which PostgREST renders as a row
    // of nulls rather than as nothing at all — so the id is what says whether
    // an offer was actually made.
    if (!row?.id) continue;

    return NextResponse.json({
      offer: {
        id: row.id,
        kind: row.kind,
        amount: row.amount,
        powerUp: row.power_up,
        expiresAt: row.expires_at,
      } satisfies Drop,
    });
  }

  // Nothing may be given right now, which is a normal answer and not an error.
  return NextResponse.json({ offer: null });
}

function pick<T>(from: T[]): T {
  return from[Math.floor(Math.random() * from.length)];
}
