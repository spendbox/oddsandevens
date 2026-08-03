import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedContributor } from "@/lib/contributor-auth";
import { maskEmail } from "@/lib/mask";
import type { AttemptRow } from "@/lib/types";

const LIMIT = 100;

interface RunJoin {
  id: string;
  status: "active" | "won" | "lost";
  guesses_used: number;
  guesses_allowed: number;
  started_at: string;
  ended_at: string | null;
  players: { email: string } | null;
  boxes: { title: string; slug: string; contributor_id: string | null } | null;
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

  const [{ data: runs }, { data: orders }] = await Promise.all([
    db
      .from("runs")
      .select(
        "id, status, guesses_used, guesses_allowed, started_at, ended_at, players(email), boxes(title, slug, contributor_id)"
      )
      .in("box_id", boxIds)
      .order("started_at", { ascending: false })
      .limit(LIMIT),
    db
      .from("power_up_orders")
      .select("run_id")
      .eq("contributor_id", contributor.id)
      .eq("status", "paid"),
  ]);

  const bought = new Map<string, number>();
  for (const order of (orders ?? []) as { run_id: string }[]) {
    bought.set(order.run_id, (bought.get(order.run_id) ?? 0) + 1);
  }

  const attempts: AttemptRow[] = ((runs ?? []) as unknown as RunJoin[]).map((run) => ({
    player: run.players?.email ? maskEmail(run.players.email) : "a player",
    boxTitle: run.boxes?.title ?? "",
    boxSlug: run.boxes?.slug ?? "",
    status: run.status,
    guessesUsed: run.guesses_used,
    guessesAllowed: run.guesses_allowed,
    powerUpsBought: bought.get(run.id) ?? 0,
    startedAt: run.started_at,
    endedAt: run.ended_at,
  }));

  return NextResponse.json({ attempts });
}
