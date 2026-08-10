import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { difficultyOf } from "@/lib/game/difficulty";
import { toDesign } from "@/lib/game/designs";
import { isChallenge } from "@/lib/game/rewards";
import type { InPlayHunt } from "@/lib/types";

/**
 * What this player has open right now.
 *
 * Deliberately not `/history`, which is the whole record — every box they have
 * ever touched, won ones and dead ones included, fifty of them, for the
 * profile screen. This is the short answer to "where was I", and it is the
 * only thing a returning player wants above the board.
 *
 * So: live boxes only, not already won, most recently touched first. A box
 * that has been cracked by somebody else drops off the list on its own, which
 * is the correct behaviour and needs no separate sweep — there is nothing to
 * go back to.
 */
const LIMIT = 8;

interface Row {
  attempts_count: number;
  best_percent: string | number;
  last_attempt_at: string | null;
  boxes: {
    slug: string;
    title: string;
    length: number;
    reward_kobo: number;
    design: string;
    best_percent: string | number;
    sponsor_name: string | null;
  } | null;
}

export async function GET() {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ hunts: [] });

  const db = supabaseAdmin();
  const { data: player } = await db
    .from("players")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!player) return NextResponse.json({ hunts: [] });

  const { data } = await db
    .from("hunts")
    .select(
      "attempts_count, best_percent, last_attempt_at, boxes!inner(slug, title, length, reward_kobo, design, best_percent, status, sponsor_name)"
    )
    .eq("player_id", player.id)
    .is("won_at", null)
    .eq("boxes.status", "live")
    .order("last_attempt_at", { ascending: false, nullsFirst: false })
    .limit(LIMIT);

  const hunts: InPlayHunt[] = ((data ?? []) as unknown as Row[])
    .filter((row): row is Row & { boxes: NonNullable<Row["boxes"]> } => !!row.boxes)
    .map((row) => ({
      slug: row.boxes.slug,
      title: row.boxes.title,
      design: toDesign(row.boxes.design),
      // The length goes in and does not come out — only the band it falls in.
      difficulty: difficultyOf(row.boxes.length),
      rewardKobo: row.boxes.reward_kobo,
      isChallenge: isChallenge(row.boxes.reward_kobo),
      attempts: row.attempts_count,
      bestPercent: Number(row.best_percent ?? 0),
      boxBestPercent: Number(row.boxes.best_percent ?? 0),
      lastAttemptAt: row.last_attempt_at,
      // The name alone. A resume card is about how far in you are; the rest of
      // the sponsorship is on the box, which is where this card sends you.
      sponsor: row.boxes.sponsor_name,
    }));

  return NextResponse.json({ hunts });
}
