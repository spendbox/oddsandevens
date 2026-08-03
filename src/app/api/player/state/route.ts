import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { ensurePlayer, toPlayerState } from "@/lib/game/boxes";

/**
 * The life pool, as the header shows it. Reading it is also what refills it:
 * `ensure_player` brings the hourly accrual up to date, so a player who leaves
 * the tab open and comes back sees the right number without anything having
 * run in the background.
 */
export async function GET() {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ player: toPlayerState(null, null) });

  const player = await ensurePlayer(supabaseAdmin(), email);
  return NextResponse.json({ player: toPlayerState(player, email) });
}
