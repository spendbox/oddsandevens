import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";

const LIMIT = 50;

interface HistoryRow {
  id: string;
  attempts_count: number;
  won_at: string | null;
  started_at: string;
  last_attempt_at: string | null;
  boxes: {
    title: string;
    slug: string;
    reward_kobo: number;
    status: string;
    kind: string;
  } | null;
}

/**
 * The player's own record: every box they've had a go at, public one included.
 *
 * Ordered by when they last touched it rather than when they started, because
 * a hunt is something you come back to over days and the one you were on last
 * night is the one you want at the top.
 */
export async function GET() {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ hunts: [] });

  const db = supabaseAdmin();
  const { data: player } = await db.from("players").select("id").eq("email", email).maybeSingle();
  if (!player) return NextResponse.json({ hunts: [] });

  const { data } = await db
    .from("hunts")
    .select(
      "id, attempts_count, won_at, started_at, last_attempt_at, boxes(title, slug, reward_kobo, status, kind)"
    )
    .eq("player_id", player.id)
    .order("last_attempt_at", { ascending: false, nullsFirst: false })
    .limit(LIMIT);

  return NextResponse.json({
    hunts: ((data ?? []) as unknown as HistoryRow[]).map((row) => ({
      id: row.id,
      attempts: row.attempts_count,
      won: row.won_at !== null,
      startedAt: row.started_at,
      lastAttemptAt: row.last_attempt_at,
      title: row.boxes?.title ?? "A spendbox",
      slug: row.boxes?.slug ?? null,
      rewardKobo: Number(row.boxes?.reward_kobo ?? 0),
      boxStatus: row.boxes?.status ?? "closed",
      isPublicBox: row.boxes?.kind === "general",
    })),
  });
}
