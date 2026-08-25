import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

/** What the chart may ask for. The view holds 180 days; nothing may exceed it. */
const WINDOWS = [7, 30, 90, 180] as const;
const DEFAULT_WINDOW = 30;

/**
 * The shape of the player base over time.
 *
 * Two reads, both of views, because the arithmetic belongs in the database:
 * `admin_activity_summary` is the headline row, `admin_activity_daily` is one
 * row per day for the last 180 with the quiet days present and zeroed.
 *
 * The window is applied by slicing the tail of an already-bounded series
 * rather than by re-grouping — the view has done the grouping once, and a
 * range filter here would be a second opinion about where a day begins. Days
 * are bucketed in `Africa/Lagos` by the view (see `activity_zone`), so an
 * evening's play lands on the evening's bar rather than tomorrow's.
 */
export async function GET(req: Request) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const asked = Number(new URL(req.url).searchParams.get("days"));
  const days = (WINDOWS as readonly number[]).includes(asked) ? asked : DEFAULT_WINDOW;

  const db = supabaseAdmin();
  const [summary, daily] = await Promise.all([
    db.from("admin_activity_summary").select("*").maybeSingle(),
    db.from("admin_activity_daily").select("*").order("day", { ascending: true }),
  ]);

  const failure = summary.error ?? daily.error;
  if (failure) {
    console.error("[admin] activity failed:", failure);
    // Same distinction the users list makes: a view the database hasn't been
    // given yet is a migration away, not a bug in this screen.
    if (failure.code === "PGRST205" || failure.code === "PGRST204") {
      return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    }
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const s = (summary.data ?? {}) as Record<string, unknown>;
  const rows = ((daily.data ?? []) as Record<string, unknown>[]).slice(-days);

  return NextResponse.json({
    days,
    summary: {
      dau: Number(s.dau ?? 0),
      dauYesterday: Number(s.dau_yesterday ?? 0),
      wau: Number(s.wau ?? 0),
      mau: Number(s.mau ?? 0),
      attemptsToday: Number(s.attempts_today ?? 0),
      attempts7d: Number(s.attempts_7d ?? 0),
      attemptsTotal: Number(s.attempts_total ?? 0),
      playersTotal: Number(s.players_total ?? 0),
      newToday: Number(s.new_today ?? 0),
      new7d: Number(s.new_7d ?? 0),
      onlineNow: Number(s.online_now ?? 0),
      everLoggedIn: Number(s.ever_logged_in ?? 0),
    },
    daily: rows.map((row) => ({
      day: String(row.day),
      activePlayers: Number(row.active_players ?? 0),
      playingPlayers: Number(row.playing_players ?? 0),
      attempts: Number(row.attempts ?? 0),
      visits: Number(row.visits ?? 0),
      loggedIn: Number(row.logged_in_players ?? 0),
      newPlayers: Number(row.new_players ?? 0),
      revenueKobo: Number(row.revenue_kobo ?? 0),
      orders: Number(row.orders ?? 0),
    })),
  });
}
