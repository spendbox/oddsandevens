import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { POWER_UP_KINDS } from "@/lib/game/power-ups";
import { findBox } from "@/lib/game/view";
import type { Drop } from "@/lib/types";

/**
 * Drops: the things that fall out of the sky mid-hunt.
 *
 * Two actions. `mint` asks whether anything is due — the browser is the thing
 * that notices the moment, because the browser is the only thing watching —
 * and `claim` takes it.
 *
 * The browser used to name the kind it wanted and cycle the power-ups itself,
 * which meant a counter that reset on every page load and therefore a discount
 * on the same power-up three reloads running. It names nothing now. It sends
 * the shortlist of power-ups still worth discounting on this box, and
 * `mint_gift` (0036) does the rest: the ninety-minute floor between gifts, the
 * per-kind caps, the least-recently-offered rotation, and the terms.
 *
 * Narrowing the shortlist is the only influence a client has, and it is a safe
 * one — taking candidates *off* the list can only ever result in a player
 * being offered less.
 */

export async function POST(req: Request) {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    slug?: string;
    offerId?: string;
    /** Power-ups still on sale on this box, so a dead one is never discounted. */
    powerUps?: unknown;
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

  // Checked against the catalogue anyway: a shortlist is a hint about what to
  // rotate through, not a channel for naming things that don't exist.
  const shortlist = Array.isArray(body.powerUps)
    ? body.powerUps.filter((k): k is string =>
        POWER_UP_KINDS.includes(k as (typeof POWER_UP_KINDS)[number])
      )
    : [];

  const { data } = await db.rpc("mint_gift", {
    p_email: email,
    p_box_id: box?.id ?? null,
    p_power_ups: shortlist,
  });

  const row = (Array.isArray(data) ? data[0] : data) as {
    id: string | null;
    kind: Drop["kind"];
    amount: number;
    power_up: string | null;
    expires_at: string;
  } | null;

  // Nothing due is a normal answer, not an error. A SQL NULL comes back from
  // PostgREST as a row of nulls rather than as nothing at all, so the id is
  // what says whether an offer was actually made.
  if (!row?.id) return NextResponse.json({ offer: null });

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
