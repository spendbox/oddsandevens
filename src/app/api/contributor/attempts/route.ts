import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedContributor } from "@/lib/contributor-auth";
import { maskEmail } from "@/lib/mask";
import type { HuntRow } from "@/lib/types";

const LIMIT = 100;

interface HuntJoin {
  id: string;
  attempts_count: number;
  won_at: string | null;
  started_at: string;
  last_attempt_at: string | null;
  players: { email: string } | null;
  boxes: { title: string; slug: string } | null;
}

/**
 * Who has been attacking this contributor's boxes.
 *
 * Addresses are masked before they leave the server, not in the browser — a
 * contributor is a stranger to these players and never needs to know more
 * than that a real person is on the other end.
 */
export async function GET() {
  const { userId, contributor } = await getAuthedContributor();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!contributor) return NextResponse.json({ attempts: [] });

  const db = supabaseAdmin();
  const { data: boxes } = await db
    .from("boxes")
    .select("id")
    .eq("contributor_id", contributor.id);
  const boxIds = ((boxes ?? []) as { id: string }[]).map((b) => b.id);
  if (boxIds.length === 0) return NextResponse.json({ attempts: [] });

  const [{ data: hunts }, { data: orders }, { data: best }] = await Promise.all([
    db
      .from("hunts")
      .select(
        "id, attempts_count, won_at, started_at, last_attempt_at, players(email), boxes(title, slug)"
      )
      .in("box_id", boxIds)
      .order("last_attempt_at", { ascending: false, nullsFirst: false })
      .limit(LIMIT),
    db
      .from("power_up_orders")
      .select("hunt_id")
      .eq("contributor_id", contributor.id)
      .eq("status", "paid"),
    // How close each hunter has got. This is the number a contributor actually
    // watches — "412 attempts" says somebody is trying, and "97.6%" says
    // somebody is about to take the money.
    //
    // Sorted descending and folded in memory rather than grouped in SQL:
    // PostgREST has no GROUP BY, and the first row per hunt in this order *is*
    // the maximum.
    db
      .from("attempts")
      .select("hunt_id, score_percent, hunts!inner(box_id)")
      .in("hunts.box_id", boxIds)
      .order("score_percent", { ascending: false })
      .limit(4000),
  ]);

  const bought = new Map<string, number>();
  for (const order of (orders ?? []) as { hunt_id: string }[]) {
    bought.set(order.hunt_id, (bought.get(order.hunt_id) ?? 0) + 1);
  }

  const bestPercent = new Map<string, number>();
  for (const row of (best ?? []) as { hunt_id: string; score_percent: number }[]) {
    if (!bestPercent.has(row.hunt_id)) {
      bestPercent.set(row.hunt_id, Number(row.score_percent));
    }
  }

  const hunted: HuntRow[] = ((hunts ?? []) as unknown as HuntJoin[]).map((hunt) => ({
    player: hunt.players?.email ? maskEmail(hunt.players.email) : "a player",
    boxTitle: hunt.boxes?.title ?? "",
    boxSlug: hunt.boxes?.slug ?? "",
    attempts: hunt.attempts_count,
    won: hunt.won_at !== null,
    powerUpsBought: bought.get(hunt.id) ?? 0,
    bestPercent: bestPercent.get(hunt.id) ?? 0,
    startedAt: hunt.started_at,
    lastAttemptAt: hunt.last_attempt_at,
  }));

  return NextResponse.json({ attempts: hunted });
}
