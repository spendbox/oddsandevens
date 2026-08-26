import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { ensurePlayer } from "@/lib/game/boxes";
import { callerKey, tooMany } from "@/lib/rate-limit";

/**
 * A player's own free safe.
 *
 * The password is drawn inside `generate_free_safe` and inserted in the same
 * transaction, so it exists in one plpgsql variable and then only as a column
 * no RLS policy grants a select on. Nothing this route can return contains it,
 * and nothing it could be asked to return would either — which is what makes
 * "you don't know it and neither do we" a fact rather than a policy.
 */

const FIELDS =
  "id, slug, title, status, reward_kobo, length, attempts_count, players_count, " +
  "best_percent, published_at, unlocked_at, creator_earned_kobo, creator_paid_kobo";

function shape(row: Record<string, unknown>) {
  const earned = Number(row.creator_earned_kobo ?? 0);
  const paid = Number(row.creator_paid_kobo ?? 0);
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    status: String(row.status),
    rewardKobo: Number(row.reward_kobo ?? 0),
    length: Number(row.length ?? 0),
    attempts: Number(row.attempts_count ?? 0),
    hunters: Number(row.players_count ?? 0),
    bestPercent: Number(row.best_percent ?? 0),
    publishedAt: row.published_at ? String(row.published_at) : null,
    unlockedAt: row.unlocked_at ? String(row.unlocked_at) : null,
    earnedKobo: earned,
    paidKobo: paid,
    owedKobo: Math.max(0, earned - paid),
  };
}

/** Their live safe, the ones they've had before, and whether they may make one. */
export async function GET() {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  const db = supabaseAdmin();
  const player = await ensurePlayer(db, email);
  if (!player) return NextResponse.json({ error: "no_player" }, { status: 400 });

  const [mine, config, live] = await Promise.all([
    db
      .from("boxes")
      .select(FIELDS)
      .eq("kind", "free")
      .eq("creator_player_id", player.id)
      .order("published_at", { ascending: false }),
    db.rpc("free_safe_config"),
    db
      .from("boxes")
      .select("id", { count: "exact", head: true })
      .eq("kind", "free")
      .eq("status", "live"),
  ]);

  if (mine.error) {
    console.error("[free-safe] read failed:", mine.error);
    if (mine.error.code === "PGRST205" || mine.error.code === "PGRST204") {
      return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    }
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const rows = (mine.data ?? []) as unknown as Record<string, unknown>[];
  const cfgRow = (Array.isArray(config.data) ? config.data[0] : config.data) as
    | { enabled?: boolean; pot_kobo?: number; max_live?: number }
    | null;

  const enabled = cfgRow?.enabled ?? true;
  const potKobo = Number(cfgRow?.pot_kobo ?? 0);
  const atCapacity = (live.count ?? 0) >= Number(cfgRow?.max_live ?? 0);
  const current = rows.find((r) => r.status === "live");

  return NextResponse.json({
    // "Can I make one" is one answer with several reasons, and the screen has
    // to be able to say which — an inert button explains nothing.
    canGenerate: enabled && !atCapacity && !current,
    reason: !enabled ? "disabled" : current ? "already_have_one" : atCapacity ? "at_capacity" : null,
    potKobo,
    safe: current ? shape(current) : null,
    past: rows.filter((r) => r.status !== "live").map(shape),
  });
}

/** Put one up. */
export async function POST(req: Request) {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  // Generating is cheap for the player and expensive for us — every live safe
  // is a real prize behind it — so the door is narrow even though the database
  // refuses a second one anyway.
  if (tooMany(callerKey(req, "free-safe"), 5, 60 * 60_000)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("generate_free_safe", { p_email: email });

  if (error) {
    console.error("[free-safe] generate failed:", error);
    if (error.code === "PGRST202" || error.code === "PGRST205") {
      return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    }
    return NextResponse.json({ error: "generate_failed" }, { status: 500 });
  }

  const verdict = (data ?? {}) as { result?: string; error?: string; slug?: string };
  if (verdict.result !== "created") {
    // Every one of these is an ordinary answer rather than a fault: they
    // already have one, we've hit the ceiling, or generation is off.
    return NextResponse.json({ error: verdict.error ?? "refused" }, { status: 409 });
  }

  return NextResponse.json({ result: "created", slug: verdict.slug });
}
