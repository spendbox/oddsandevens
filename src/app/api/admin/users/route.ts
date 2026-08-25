import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

const LIMIT = 200;

/**
 * The column each sort actually orders by.
 *
 * Named here rather than interpolated from the query string: `order` takes a
 * column name, and a column name that came from a URL is a column name an
 * attacker chose. An unknown sort falls back to spend rather than erroring —
 * a stale bookmark should show the list, not a 400.
 */
const SORTS = {
  spent: "spent_kobo",
  attempts: "attempts",
  recent: "last_seen",
  played: "last_played_at",
  login: "last_login_at",
  active: "days_active_30",
  joined: "created_at",
} as const;

type Sort = keyof typeof SORTS;

/**
 * Every player: what they've spent, and when they were last here.
 *
 * Reads `admin_players`, a view that does the arithmetic in SQL over five
 * tables. Stitching those joins together in a route means getting one wrong
 * silently under-reports money, which is the kind of bug nobody notices for a
 * month.
 *
 * Addresses are *not* masked here — this is the one screen in the product
 * whose whole job is answering a support email, and you cannot answer one
 * about `a**@g***.com`.
 */
export async function GET(req: Request) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const sortKey = (url.searchParams.get("sort") ?? "spent") as Sort;
  const column = SORTS[sortKey] ?? SORTS.spent;

  let request = supabaseAdmin().from("admin_players").select("*");
  if (query) request = request.ilike("email", `%${query}%`);

  const { data, error } = await request
    // Somebody who has never logged in or never played sorts last on those
    // columns rather than first: an empty cell is not a recent one.
    .order(column, { ascending: false, nullsFirst: false })
    .limit(LIMIT);

  if (error) {
    console.error("[admin] users failed:", error);
    // PGRST205 is not "broken", it's "not migrated yet, or migrated and the
    // API hasn't noticed". Saying so beats a 500 that reads like a bug in the
    // page, because the fix is one migration or one NOTIFY away.
    if (error.code === "PGRST205" || error.code === "PGRST204") {
      return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    }
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const text = (v: unknown) => (v == null ? null : String(v));

  return NextResponse.json({
    users: rows.map((row) => ({
      id: String(row.id),
      email: String(row.email),
      lives: Number(row.lives),
      hasPassword: !!row.has_password,
      wasInvited: !!row.was_invited,
      bankName: (row.bank_name as string | null) ?? null,
      accountName: (row.account_name as string | null) ?? null,
      livesBought: Number(row.lives_bought ?? 0),
      lifeKobo: Number(row.life_kobo ?? 0),
      powerUpsBought: Number(row.power_ups_bought ?? 0),
      powerUpKobo: Number(row.power_up_kobo ?? 0),
      spentKobo: Number(row.spent_kobo ?? 0),
      spent30dKobo: Number(row.spent_30d_kobo ?? 0),
      hunts: Number(row.hunts ?? 0),
      attempts: Number(row.attempts ?? 0),
      wins: Number(row.wins ?? 0),
      wonKobo: Number(row.won_kobo ?? 0),
      createdAt: String(row.created_at),

      // When, rather than how much. Every one of these is nullable, and a null
      // means "not since we started counting" rather than zero — the client
      // prints those differently on purpose.
      lastSeen: text(row.last_seen),
      lastLoginAt: text(row.last_login_at),
      lastPlayedAt: text(row.last_played_at),
      firstPlayedAt: text(row.first_played_at),
      loginCount: Number(row.login_count ?? 0),
      visits: Number(row.visits ?? 0),
      daysActive: Number(row.days_active ?? 0),
      daysActive30: Number(row.days_active_30 ?? 0),
      attempts7d: Number(row.attempts_7d ?? 0),
      attempts30d: Number(row.attempts_30d ?? 0),
    })),
    total: rows.length,
    truncated: rows.length === LIMIT,
  });
}
