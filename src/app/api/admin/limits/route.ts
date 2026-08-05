import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { loadLimits, sanitiseLimits } from "@/lib/game/limits";

/**
 * The account cap, and the evidence for choosing one.
 *
 * The clusters come back with the settings on purpose. A number picked without
 * looking at them is a guess, and the cost of guessing low is locking a whole
 * carrier out of signing up — so the screen shows what is actually there
 * before it asks for a number.
 *
 * The hashes are salted and one-way. They identify a *group* of accounts, not
 * a place, which is the only thing anybody here needs.
 */
export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const [limits, clusters] = await Promise.all([
    loadLimits(db),
    db.rpc("ip_clusters", { p_hours: 168, p_limit: 20 }),
  ]);

  const rows = (clusters.data ?? []) as {
    ip_hash: string;
    accounts: number;
    first_at: string;
    last_at: string;
  }[];

  return NextResponse.json({
    limits,
    clusters: rows.map((row) => ({
      // Eight characters is enough to tell two clusters apart on screen and
      // not enough to be a useful thing to carry around.
      id: row.ip_hash.slice(0, 8),
      accounts: Number(row.accounts),
      firstAt: row.first_at,
      lastAt: row.last_at,
    })),
  });
}

export async function PUT(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const clean = sanitiseLimits(await req.json().catch(() => ({})));
  const { error } = await supabaseAdmin().rpc("set_limit_settings", {
    p_value: clean,
    p_by: admin.email,
  });
  if (error) {
    console.error("[limits] save failed:", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ limits: clean });
}
