import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { POWER_UP_KINDS, apply, isPowerUpKind, parseRevealed } from "@/lib/game/power-ups";
import { findBox, findHunt } from "@/lib/game/view";
import type { BoxRow } from "@/lib/game/boxes";
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

    /*
     * The box is named at the claim, not at the mint.
     *
     * A crate's offer already carries the safe it fell on, and for those this
     * changes nothing. A streak's reward carries none — it was won the moment
     * somebody opened the app — so the safe they are looking at when they
     * spend it is the one it attaches to. `attach_offer_box` fills that in and
     * then runs the ordinary claim, so there is still exactly one path.
     */
    const claimOn = body.slug ? await findBox(db, body.slug) : null;
    const { data } = claimOn
      ? await db.rpc("attach_offer_box", {
          p_email: email,
          p_offer_id: body.offerId,
          p_box_id: claimOn.id,
        })
      : await db.rpc("claim_offer", { p_email: email, p_offer_id: body.offerId });

    const result = (data ?? {}) as {
      result?: string;
      error?: string;
      lives?: number;
      kind?: string;
      power_up?: string | null;
    };
    if (result.result !== "claimed") {
      return NextResponse.json({ error: result.error ?? "offer_gone" }, { status: 409 });
    }

    // A free power-up is the one grant SQL can't finish: what X-Ray reveals is
    // described once, in TypeScript, by `apply` — the same function the paid
    // path runs when Paystack confirms. This is that path without the money.
    if (result.kind === "free_power_up" && claimOn) {
      const note = await fire(db, claimOn, email, result.power_up);
      return NextResponse.json({ ...result, note });
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
      // `mint_gift` always mints against the safe it was asked about, so a
      // crate is never floating. Only a streak reward is.
      floating: false,
    } satisfies Drop,
  });
}

/**
 * Run a won power-up against the safe the player chose.
 *
 * The same three steps `settlePowerUp` takes once Paystack confirms a payment —
 * find the hunt, `apply` the effect to it, write the revealed state back — with
 * no order and no money. A hunt is created if there isn't one: a streak reward
 * spent before the first guess is a legitimate way to open a safe.
 */
async function fire(
  db: ReturnType<typeof supabaseAdmin>,
  box: BoxRow,
  email: string,
  powerUp: string | null | undefined
): Promise<string | null> {
  if (!powerUp || !isPowerUpKind(powerUp)) return null;

  const { data: player } = await db.from("players").select("id").eq("email", email).maybeSingle();
  if (!player) return null;
  const playerId = (player as { id: string }).id;

  let hunt = await findHunt(db, box.id, playerId);
  if (!hunt) {
    await db.from("hunts").insert({ box_id: box.id, player_id: playerId });
    hunt = await findHunt(db, box.id, playerId);
  }
  // A hunt already won has nothing left to reveal into, and the reward is
  // spent either way — the claim has already been recorded.
  if (!hunt || hunt.won_at) return null;

  const { data: secretRow } = await db
    .from("boxes")
    .select("secret")
    .eq("id", box.id)
    .maybeSingle();
  const secret = (secretRow as { secret: string | null } | null)?.secret;
  if (!secret) return null;

  const { revealed, note } = apply(powerUp, secret, parseRevealed(hunt.revealed));
  await db.from("hunts").update({ revealed }).eq("id", hunt.id);
  return note;
}
