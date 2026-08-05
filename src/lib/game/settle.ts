// Turning a confirmed Paystack payment into the thing it bought.
//
// Two callers reach every one of these: the webhook, and the verify route the
// player lands back on. Whichever arrives first does the work, so each
// function is written to be safe to run twice — the status column is flipped
// with a conditional update and everything downstream hangs off that update
// actually having matched a row.

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  apply,
  isPowerUpKind,
  LIFE_BANK_MAX,
  parseRevealed,
} from "@/lib/game/power-ups";

type Db = ReturnType<typeof supabaseAdmin>;

/** Flip an order to paid, and report whether *this* call is the one that did. */
async function markPaid(
  db: Db,
  table: "power_up_orders" | "life_orders" | "funding_orders",
  reference: string
): Promise<{ claimed: boolean; row: Record<string, unknown> | null }> {
  const { data } = await db
    .from(table)
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("reference", reference)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (data) return { claimed: true, row: data as Record<string, unknown> };

  // Already settled (or never existed) — hand back the row so callers can
  // still answer "what did this reference buy?".
  const { data: existing } = await db
    .from(table)
    .select("*")
    .eq("reference", reference)
    .maybeSingle();
  return { claimed: false, row: (existing as Record<string, unknown> | null) ?? null };
}

export async function markFailed(
  db: Db,
  table: "power_up_orders" | "life_orders" | "funding_orders",
  reference: string
): Promise<void> {
  await db
    .from(table)
    .update({ status: "failed" })
    .eq("reference", reference)
    .eq("status", "pending");
}

/**
 * A power-up fires the moment its payment lands: the effect is computed
 * against the password and folded into the run's revealed state. The note it
 * returns is what the player is shown, and it is stored on the order so
 * re-verifying a reference replays the same answer instead of re-rolling a
 * random Sweep.
 */
export async function settlePowerUp(
  db: Db,
  reference: string
): Promise<{ settled: boolean; note: string | null }> {
  const { claimed, row } = await markPaid(db, "power_up_orders", reference);
  if (!row) return { settled: false, note: null };
  if (!claimed) {
    return {
      settled: row.status === "paid",
      note: (row.note as string | null) ?? null,
    };
  }

  const kind = String(row.kind);
  if (!isPowerUpKind(kind)) return { settled: true, note: null };

  const { data: hunt } = await db
    .from("hunts")
    .select("id, revealed, won_at")
    .eq("id", row.hunt_id as string)
    .maybeSingle();
  const { data: box } = await db
    .from("boxes")
    .select("secret")
    .eq("id", row.box_id as string)
    .maybeSingle();
  if (!hunt || !box) return { settled: true, note: null };

  const { revealed, note } = apply(kind, box.secret as string, parseRevealed(hunt.revealed));

  // A hunt already won while the player was at the checkout keeps the purchase
  // on record but has nothing left to reveal into.
  if (!hunt.won_at) {
    await db.from("hunts").update({ revealed }).eq("id", hunt.id);
  }

  // Life Bank is the one power-up whose effect isn't on the hunt. It raises the
  // ceiling on the player's pool, which is shared across every box, so it is
  // applied here rather than folded into `revealed`. `grant_life_bank` takes
  // the greater of the two values, so a replayed webhook is a no-op.
  if (kind === "life_bank") {
    await db.rpc("grant_life_bank", {
      p_player_id: row.player_id as string,
      p_to: LIFE_BANK_MAX,
    });
  }

  await db.from("power_up_orders").update({ note }).eq("reference", reference);

  return { settled: true, note };
}

/**
 * A paid top-up.
 *
 * `settle_life_purchase` rather than `credit_lives` because a top-up does
 * three things, not one: it credits what was bought, pays out any referral
 * bonus banked since last time, and — if this is the purchase that finally
 * qualifies the invite that brought this player here — banks the next one for
 * them and for whoever invited them. The ordering matters and lives in the
 * migration, where it can't be got wrong by a second caller.
 */
export async function settleLives(
  db: Db,
  reference: string
): Promise<{ settled: boolean; quantity: number; bonus: number }> {
  const { claimed, row } = await markPaid(db, "life_orders", reference);
  if (!row) return { settled: false, quantity: 0, bonus: 0 };
  const quantity = Number(row.quantity ?? 0);
  if (!claimed) return { settled: row.status === "paid", quantity, bonus: 0 };

  const { data } = await db.rpc("settle_life_purchase", {
    p_player_id: row.player_id as string,
    p_quantity: quantity,
  });
  const bonus = Number((data as { bonus_applied?: number } | null)?.bonus_applied ?? 0);

  return { settled: true, quantity, bonus };
}

/**
 * Money reaching a box. One of two things, told apart by `raises_to_kobo`:
 *
 *  - **Initial funding.** The box goes live. This is the only path from
 *    'funding' to 'live' — a contributor cannot publish a box they haven't
 *    paid for.
 *  - **A raise.** The reward on an already-live box goes up. `raise_reward`
 *    refuses anything that isn't strictly an increase, so a stale or replayed
 *    order can only ever be a no-op.
 */
export async function settleFunding(
  db: Db,
  reference: string
): Promise<{ settled: boolean; boxId: string | null }> {
  const { claimed, row } = await markPaid(db, "funding_orders", reference);
  if (!row) return { settled: false, boxId: null };
  const boxId = (row.box_id as string) ?? null;
  if (!claimed) return { settled: row.status === "paid", boxId };

  const raisesTo = row.raises_to_kobo as number | null;
  if (raisesTo) {
    await db.rpc("raise_reward", { p_box_id: boxId, p_funding_kobo: raisesTo });
  } else {
    await db
      .from("boxes")
      .update({ status: "live", published_at: new Date().toISOString() })
      .eq("id", boxId)
      .eq("status", "funding");
  }

  return { settled: true, boxId };
}

/** Which table a reference belongs to, read off the prefix we minted it with. */
export function orderTableFor(
  reference: string
): "power_up_orders" | "life_orders" | "funding_orders" | null {
  if (reference.startsWith("pu_")) return "power_up_orders";
  if (reference.startsWith("life_")) return "life_orders";
  if (reference.startsWith("fund_")) return "funding_orders";
  return null;
}
