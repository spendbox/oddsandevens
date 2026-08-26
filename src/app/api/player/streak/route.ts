import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { clientIpHash } from "@/lib/ip";
import { callerKey, tooMany } from "@/lib/rate-limit";

/**
 * The daily streak: where it stands, and taking today's reward.
 *
 * The state machine is entirely in `claim_streak`, in one transaction, with a
 * unique key on (player, cycle, day) deciding a double tap rather than a check
 * in this file. Nothing here decides anything about the streak — it carries an
 * address in and a verdict out.
 */

function shape(row: Record<string, unknown>) {
  return {
    enabled: Boolean(row.enabled ?? false),
    day: Number(row.day ?? 0),
    cycle: Number(row.cycle ?? 1),
    bestDay: Number(row.best_day ?? 0),
    claimedToday: Boolean(row.claimed_today ?? false),
    claimable: Boolean(row.claimable ?? false),
    nextDay: Number(row.next_day ?? 1),
    broke: Boolean(row.broke ?? false),
    ladder: (row.ladder ?? []) as unknown[],
  };
}

export async function GET() {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  const { data, error } = await supabaseAdmin().rpc("streak_state", { p_email: email });
  if (error) {
    console.error("[streak] state failed:", error);
    if (error.code === "PGRST202" || error.code === "PGRST205") {
      return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    }
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  return NextResponse.json(shape((data ?? {}) as Record<string, unknown>));
}

export async function POST(req: Request) {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  // The database refuses a second claim on the same day anyway; this only
  // stops one machine spending its way through that refusal.
  if (tooMany(callerKey(req, "streak-claim"), 30, 60 * 60_000)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("claim_streak", {
    p_email: email,
    // A streak rewards visiting, and visiting is free — so where the claims
    // come from is recorded. It is a hash, never an address.
    p_ip_hash: clientIpHash(req),
  });

  if (error) {
    console.error("[streak] claim failed:", error);
    if (error.code === "PGRST202" || error.code === "PGRST205") {
      return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    }
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }

  const verdict = (data ?? {}) as { result?: string; error?: string };
  if (verdict.result !== "claimed") {
    // "Already claimed" and "switched off" are ordinary answers a screen has
    // to render, not faults.
    return NextResponse.json({ error: verdict.error ?? "refused" }, { status: 409 });
  }
  return NextResponse.json(verdict);
}
