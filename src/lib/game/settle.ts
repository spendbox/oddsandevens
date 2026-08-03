// Turning a confirmed Paystack payment into the thing it bought.
//
// Two callers reach every one of these: the webhook, and the verify route the
// player lands back on. Whichever arrives first does the work, so each
// function is written to be safe to run twice — the status column is flipped
// with a conditional update and everything downstream hangs off that update
// actually having matched a row.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { apply, isPowerUpKind, parseRevealed } from "@/lib/game/power-ups";

type Db = ReturnType<typeof supabaseAdmin>;

/** Flip an order to paid, and report whether *this* call is the one that did. */
async function markPaid(
  db: Db,
  table: "power_up_orders" | "life_orders" | "stake_orders",
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
  table: "power_up_orders" | "life_orders" | "stake_orders",
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

  const { data: run } = await db
    .from("runs")
    .select("id, revealed, status")
    .eq("id", row.run_id as string)
    .maybeSingle();
  const { data: box } = await db
    .from("boxes")
    .select("secret")
    .eq("id", row.box_id as string)
    .maybeSingle();
  if (!run || !box) return { settled: true, note: null };

  const { revealed, note } = apply(kind, box.secret as string, parseRevealed(run.revealed));

  // A run that ended while the player was at the checkout keeps the purchase
  // on record but has nothing left to reveal into.
  if (run.status === "active") {
    await db.from("runs").update({ revealed }).eq("id", run.id);
  }
  await db.from("power_up_orders").update({ note }).eq("reference", reference);

  return { settled: true, note };
}

export async function settleLives(
  db: Db,
  reference: string
): Promise<{ settled: boolean; quantity: number }> {
  const { claimed, row } = await markPaid(db, "life_orders", reference);
  if (!row) return { settled: false, quantity: 0 };
  const quantity = Number(row.quantity ?? 0);
  if (!claimed) return { settled: row.status === "paid", quantity };

  await db.rpc("credit_lives", {
    p_player_id: row.player_id as string,
    p_count: quantity,
  });
  return { settled: true, quantity };
}

/**
 * A funded box goes live. This is the only path from 'funding' to 'live' —
 * a contributor cannot publish a box they haven't paid for.
 */
export async function settleStake(
  db: Db,
  reference: string
): Promise<{ settled: boolean; boxId: string | null }> {
  const { claimed, row } = await markPaid(db, "stake_orders", reference);
  if (!row) return { settled: false, boxId: null };
  const boxId = (row.box_id as string) ?? null;
  if (!claimed) return { settled: row.status === "paid", boxId };

  await db
    .from("boxes")
    .update({ status: "live", published_at: new Date().toISOString() })
    .eq("id", boxId)
    .eq("status", "funding");

  return { settled: true, boxId };
}

/** Which table a reference belongs to, read off the prefix we minted it with. */
export function orderTableFor(
  reference: string
): "power_up_orders" | "life_orders" | "stake_orders" | null {
  if (reference.startsWith("pu_")) return "power_up_orders";
  if (reference.startsWith("life_")) return "life_orders";
  if (reference.startsWith("stake_")) return "stake_orders";
  return null;
}
