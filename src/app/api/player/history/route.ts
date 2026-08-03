import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";

const LIMIT = 30;

interface HistoryRow {
  id: string;
  status: "active" | "won" | "lost";
  guesses_used: number;
  guesses_allowed: number;
  started_at: string;
  ended_at: string | null;
  boxes: { title: string; slug: string; prize_kobo: number; status: string } | null;
}

/** The player's own record: what they've attacked and how it went. */
export async function GET() {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ runs: [] });

  const db = supabaseAdmin();
  const { data: player } = await db.from("players").select("id").eq("email", email).maybeSingle();
  if (!player) return NextResponse.json({ runs: [] });

  const { data } = await db
    .from("runs")
    .select(
      "id, status, guesses_used, guesses_allowed, started_at, ended_at, boxes(title, slug, prize_kobo, status)"
    )
    .eq("player_id", player.id)
    .order("started_at", { ascending: false })
    .limit(LIMIT);

  return NextResponse.json({
    runs: ((data ?? []) as unknown as HistoryRow[]).map((row) => ({
      id: row.id,
      status: row.status,
      guessesUsed: row.guesses_used,
      guessesAllowed: row.guesses_allowed,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      title: row.boxes?.title ?? "A spendbox",
      slug: row.boxes?.slug ?? null,
      prizeKobo: Number(row.boxes?.prize_kobo ?? 0),
      boxStatus: row.boxes?.status ?? "closed",
    })),
  });
}
