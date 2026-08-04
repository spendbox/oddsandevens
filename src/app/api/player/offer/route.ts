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
 * It asks; the server decides. Free lives are capped at five and discounts at
 * half price, here, on the server, and `mint_offer` refuses to make a second
 * one while the first is unclaimed — a browser that can ask twice will.
 */

/** The most generous a drop is ever allowed to be. */
const MAX_FREE_LIVES = 5;
const MAX_DISCOUNT = 50;
/** How long one hangs around before it is gone. */
const MINUTES = 10;

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

  // Which of the two, and on what terms. A discount needs a power-up to be
  // about, so an unrecognised one becomes free lives rather than an error —
  // there is no version of this worth showing a player a failure for.
  const wantsDiscount =
    body.kind === "power_up_discount" &&
    !!box &&
    POWER_UP_KINDS.includes(body.powerUp as (typeof POWER_UP_KINDS)[number]);

  const kind = wantsDiscount ? "power_up_discount" : "free_lives";
  const amount = wantsDiscount
    ? pick([20, 25, 30, 40, MAX_DISCOUNT])
    : pick([1, 2, 3, MAX_FREE_LIVES]);

  const { data } = await db.rpc("mint_offer", {
    p_email: email,
    p_kind: kind,
    p_amount: amount,
    p_power_up: wantsDiscount ? body.powerUp : null,
    p_box_id: box?.id ?? null,
    p_minutes: MINUTES,
  });

  const row = (Array.isArray(data) ? data[0] : data) as {
    id: string;
    kind: Drop["kind"];
    amount: number;
    power_up: string | null;
    expires_at: string;
  } | null;

  if (!row) return NextResponse.json({ error: "mint_failed" }, { status: 500 });

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

function pick<T>(from: T[]): T {
  return from[Math.floor(Math.random() * from.length)];
}
