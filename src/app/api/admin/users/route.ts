import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

const LIMIT = 200;

/**
 * Every player, with what they've spent.
 *
 * Reads `admin_players`, a view that does the three-table arithmetic in SQL.
 * The sums are over lives, power-ups and claims; stitching them together in a
 * route means getting a join wrong silently under-reports money, which is the
 * kind of bug nobody notices for a month.
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
  const sort = url.searchParams.get("sort") ?? "spent";

  let request = supabaseAdmin().from("admin_players").select("*");
  if (query) request = request.ilike("email", `%${query}%`);

  const column =
    sort === "recent" ? "last_seen" : sort === "attempts" ? "attempts" : "spent_kobo";

  const { data, error } = await request.order(column, { ascending: false }).limit(LIMIT);
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
      hunts: Number(row.hunts ?? 0),
      attempts: Number(row.attempts ?? 0),
      wins: Number(row.wins ?? 0),
      wonKobo: Number(row.won_kobo ?? 0),
      createdAt: String(row.created_at),
      lastSeen: String(row.last_seen),
    })),
    total: rows.length,
    truncated: rows.length === LIMIT,
  });
}
