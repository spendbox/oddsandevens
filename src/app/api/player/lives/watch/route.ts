import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { ensurePlayer } from "@/lib/game/boxes";
import { pushConfigured } from "@/lib/push";

/**
 * "Tell me when they're back."
 *
 * Recorded on the player rather than inferred from having a push subscription,
 * because those are two different consents and only one of them is about
 * lives. Somebody may have turned notifications on months ago for a hunt they
 * were in; that is not a request to be told about a pool refilling, and the
 * daily job's idle rule is what keeps it from becoming one.
 *
 * A watch is spent by the first push it earns. `POST` asks, `DELETE` takes it
 * back — both are idempotent, because the button that calls them is on a
 * dialog somebody may tap twice.
 */

export async function POST() {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });
  // Refused rather than stored: a deployment with no VAPID keys can never send
  // it, and a promise recorded in a table nothing will read is still a broken
  // promise. The dialog checks first, so this only catches the race.
  if (!pushConfigured()) {
    return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  }

  const db = supabaseAdmin();
  const player = await ensurePlayer(db, email);
  if (!player) return NextResponse.json({ error: "player_failed" }, { status: 500 });

  const { data, error } = await db.rpc("watch_lives_full", { p_player_id: player.id });
  if (error) {
    console.error("[lives-watch] failed:", error);
    if (error.code === "PGRST202" || error.code === "PGRST205") {
      return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    }
    return NextResponse.json({ error: "watch_failed" }, { status: 500 });
  }

  return NextResponse.json({ watching: data === true });
}

export async function DELETE() {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  const db = supabaseAdmin();
  const player = await ensurePlayer(db, email);
  if (!player) return NextResponse.json({ error: "player_failed" }, { status: 500 });

  const { error } = await db.rpc("unwatch_lives_full", { p_player_id: player.id });
  if (error) {
    console.error("[lives-watch] clear failed:", error);
    return NextResponse.json({ error: "watch_failed" }, { status: 500 });
  }
  return NextResponse.json({ watching: false });
}
