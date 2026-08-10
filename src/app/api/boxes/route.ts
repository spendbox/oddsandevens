import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PUBLIC_BOX_COLUMNS, toPublicBox, type BoxRow } from "@/lib/game/boxes";

const RECENT_UNLOCKS = 8;

/**
 * Everything worth playing: the platform's public box first, then every live
 * contributor box, richest prize first — followed by a short roll of safes
 * that have already been opened, because seeing that somebody actually got
 * paid is the whole argument for trying.
 */
export async function GET() {
  const db = supabaseAdmin();

  const [{ data: live, error: liveError }, { data: unlocked, error: unlockedError }] =
    await Promise.all([
      db
        .from("boxes")
        .select(PUBLIC_BOX_COLUMNS)
        .eq("status", "live")
        .order("prize_kobo", { ascending: false }),
      db
        .from("boxes")
        .select(PUBLIC_BOX_COLUMNS)
        .eq("status", "unlocked")
        .order("unlocked_at", { ascending: false })
        .limit(RECENT_UNLOCKS),
    ]);

  // Logged rather than swallowed, for the reason written out at length on the
  // lobby page: a query that fails and a board that is empty produce the same
  // JSON from here, and only one of them is somebody's fault.
  if (liveError) console.error("[boxes] live boxes failed to load:", liveError);
  if (unlockedError) console.error("[boxes] cracked boxes failed to load:", unlockedError);

  const rows = [...((live ?? []) as BoxRow[]), ...((unlocked ?? []) as BoxRow[])];
  const names = await displayNames(db, rows);
  const winners = await winnerEmails(db, rows);

  const decorate = (row: BoxRow) =>
    toPublicBox(row, {
      contributor: row.contributor_id ? (names.get(row.contributor_id) ?? null) : null,
      winnerEmail: row.unlocked_by ? (winners.get(row.unlocked_by) ?? null) : null,
    });

  const liveBoxes = ((live ?? []) as BoxRow[]).map(decorate);

  return NextResponse.json({
    featured: liveBoxes.find((b) => b.kind === "general") ?? null,
    boxes: liveBoxes.filter((b) => b.kind === "contributor"),
    cracked: ((unlocked ?? []) as BoxRow[]).map(decorate),
  });
}

type Db = ReturnType<typeof supabaseAdmin>;

async function displayNames(db: Db, rows: BoxRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.contributor_id).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const { data } = await db.from("contributors").select("id, display_name").in("id", ids);
  return new Map(
    ((data ?? []) as { id: string; display_name: string }[]).map((c) => [c.id, c.display_name])
  );
}

/** Raw addresses; `toPublicBox` is the one place that masks them. */
async function winnerEmails(db: Db, rows: BoxRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.unlocked_by).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const { data } = await db.from("players").select("id, email").in("id", ids);
  return new Map(((data ?? []) as { id: string; email: string }[]).map((p) => [p.id, p.email]));
}
