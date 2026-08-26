import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

const LIMIT = 200;

/** Named here, never taken from the query string: `order` takes a column name. */
const SORTS = {
  best: "best_percent",
  attempts: "attempts_count",
  recent: "last_attempt_at",
  reward: "reward_kobo",
} as const;

type Sort = keyof typeof SORTS;

/**
 * Who is closest, on every box at once.
 *
 * A contributor sees their own boxes and a player sees their own hunts. This
 * is the only view of the whole board — the one that answers "is anything
 * about to be won", which is worth knowing before it happens rather than when
 * the payout screen tells you.
 *
 * One row per *hunt*, not per attempt. `attempts` has a row per guess and a
 * popular safe has thousands; the question anybody actually asks is how close
 * the closest person is, and that is `hunts.best_percent`.
 */
export async function GET(req: Request) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const sortKey = (url.searchParams.get("sort") ?? "best") as Sort;
  const column = SORTS[sortKey] ?? SORTS.best;
  const box = url.searchParams.get("box");
  const liveOnly = url.searchParams.get("live") !== "0";
  const query = (url.searchParams.get("q") ?? "").trim();

  let request = supabaseAdmin().from("admin_best_attempts").select("*");
  if (box) request = request.eq("box_id", box);
  // A hunt on a cracked box is history; the default question is about boxes
  // somebody can still win.
  if (liveOnly) request = request.eq("box_status", "live");
  if (query) request = request.ilike("player_email", `%${query}%`);

  const { data, error } = await request
    .order(column, { ascending: false, nullsFirst: false })
    .limit(LIMIT);

  if (error) {
    console.error("[admin] attempts failed:", error);
    if (error.code === "PGRST205" || error.code === "PGRST204") {
      return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    }
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return NextResponse.json({
    hunts: rows.map((row) => ({
      huntId: String(row.hunt_id),
      boxId: String(row.box_id),
      boxSlug: String(row.box_slug),
      boxTitle: String(row.box_title),
      boxKind: String(row.box_kind),
      boxStatus: String(row.box_status),
      rewardKobo: Number(row.reward_kobo ?? 0),
      passwordLength: Number(row.password_length ?? 0),
      boxBestPercent: Number(row.box_best_percent ?? 0),
      playerEmail: String(row.player_email),
      bestPercent: Number(row.best_percent ?? 0),
      attempts: Number(row.attempts_count ?? 0),
      lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : null,
      wonAt: row.won_at ? String(row.won_at) : null,
      powerUpsBought: Number(row.power_ups_bought ?? 0),
      powerUpKobo: Number(row.power_up_kobo ?? 0),
    })),
    truncated: rows.length === LIMIT,
  });
}
