import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { POWER_UP_KINDS } from "@/lib/game/power-ups";
import { STREAK_DAYS, type Grant, type GrantKind, type StreakDay } from "@/lib/game/streaks";

/**
 * The streak ladder, from the platform's side.
 *
 * Two things an administrator can do here and nowhere else: rewrite what any
 * of the thirty days gives, and switch the whole thing off. The ladder is a
 * settings blob rather than a table because it is read on every claim and
 * written about twice a year — and because "the days, as one document" is the
 * shape the editor works in.
 *
 * The list also reports how many accounts share an IP hash with each streak,
 * which is the abuse this invites: thirty days of free lives is worth farming
 * if you can run ten browsers at it.
 */

const KINDS: GrantKind[] = [
  "free_lives",
  "life_discount",
  "power_up_discount",
  "free_second_wind",
  "free_power_up",
  "life_bank",
];

/**
 * What a browser is allowed to store as a ladder.
 *
 * Everything here is bounded rather than trusted: a `powerUp` must name one
 * that exists, a percentage cannot exceed a hundred, and a day outside 1–30
 * is dropped rather than clamped — there is no honest reading of "day 40".
 * A ladder that survives this can be handed to `claim_streak` without it
 * having to defend itself.
 */
function cleanLadder(input: unknown): StreakDay[] | null {
  if (!Array.isArray(input)) return null;
  const byDay = new Map<number, StreakDay>();

  for (const raw of input) {
    const row = raw as { day?: unknown; grants?: unknown };
    const day = Math.trunc(Number(row?.day));
    if (!Number.isFinite(day) || day < 1 || day > STREAK_DAYS) continue;
    if (!Array.isArray(row?.grants)) continue;

    const grants: Grant[] = [];
    for (const g of row.grants) {
      const one = g as { kind?: unknown; amount?: unknown; powerUp?: unknown };
      const kind = String(one?.kind ?? "") as GrantKind;
      if (!KINDS.includes(kind)) continue;

      const grant: Grant = { kind };

      if (kind === "life_discount" || kind === "power_up_discount") {
        const amount = Math.trunc(Number(one?.amount));
        if (!Number.isFinite(amount) || amount < 1) continue;
        grant.amount = Math.min(100, amount);
      } else if (kind === "free_lives" || kind === "life_bank") {
        const amount = Math.trunc(Number(one?.amount));
        if (!Number.isFinite(amount) || amount < 1) continue;
        // A ceiling on generosity rather than on correctness: a slipped zero
        // is the realistic mistake here, and 5,000 free lives cannot be undone.
        grant.amount = Math.min(kind === "life_bank" ? 365 : 500, amount);
      }

      if (kind === "power_up_discount" || kind === "free_power_up") {
        const powerUp = String(one?.powerUp ?? "");
        if (!POWER_UP_KINDS.includes(powerUp as (typeof POWER_UP_KINDS)[number])) continue;
        grant.powerUp = powerUp;
      }

      grants.push(grant);
    }

    byDay.set(day, { day, grants });
  }

  if (byDay.size === 0) return null;
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  const [summary, ladder, enabled, list] = await Promise.all([
    db.from("admin_streak_summary").select("*").maybeSingle(),
    db.rpc("streak_ladder"),
    db.rpc("streaks_enabled"),
    db.from("admin_streaks").select("*").order("day", { ascending: false }).limit(200),
  ]);

  const failure = summary.error ?? ladder.error ?? enabled.error ?? list.error;
  if (failure) {
    console.error("[admin] streaks failed:", failure);
    if (failure.code === "PGRST202" || failure.code === "PGRST205" || failure.code === "PGRST204") {
      return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    }
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const s = (summary.data ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    enabled: Boolean(enabled.data ?? true),
    ladder: (ladder.data ?? []) as StreakDay[],
    summary: {
      players: Number(s.players ?? 0),
      pastWeekOne: Number(s.past_week_one ?? 0),
      completed: Number(s.completed ?? 0),
      longest: Number(s.longest ?? 0),
      claimsAllTime: Number(s.claims_all_time ?? 0),
      claimsToday: Number(s.claims_today ?? 0),
    },
    players: ((list.data ?? []) as Record<string, unknown>[]).map((row) => ({
      email: String(row.email ?? ""),
      day: Number(row.day ?? 0),
      cycle: Number(row.cycle ?? 1),
      bestDay: Number(row.best_day ?? 0),
      claims: Number(row.claims ?? 0),
      lastClaimDay: row.last_claim_day ? String(row.last_claim_day) : null,
      sameIp: Number(row.accounts_on_same_ip ?? 0),
    })),
  });
}

export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    /** The whole ladder. Omitted leaves the stored one alone; `[]` restores the default. */
    days?: unknown;
  };

  const db = supabaseAdmin();

  // Read-modify-write rather than a blind overwrite: the panel can save the
  // switch without holding the ladder, and the ladder without the switch.
  const { data: current } = await db.rpc("streak_settings");
  const value = { ...((current ?? {}) as Record<string, unknown>) };

  if (typeof body.enabled === "boolean") value.enabled = body.enabled;

  if (body.days !== undefined) {
    const days = cleanLadder(body.days);
    if (Array.isArray(body.days) && body.days.length > 0 && !days) {
      return NextResponse.json({ error: "invalid_ladder" }, { status: 400 });
    }
    // An empty ladder is how the built-in one comes back — `streak_ladder`
    // falls through to `streak_default_ladder` when there is nothing stored.
    if (days) value.days = days;
    else delete value.days;
  }

  const { error } = await db.rpc("set_streak_settings", { p_value: value, p_by: admin.email });
  if (error) {
    console.error("[admin] streak settings failed:", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ result: "saved" });
}
