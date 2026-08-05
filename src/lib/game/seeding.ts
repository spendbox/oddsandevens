// Making an empty board look like a place people play.
//
// Nobody joins a game with nobody in it. A wall of cracked safes with nothing
// on it, and a live box reading "0 hunters", is a platform that says it has
// never worked — which is true on the first day and stops being true only if
// somebody plays anyway. So an admin can author a box that arrives already
// finished, put a number on the counters, and put a handful of names on a
// leaderboard.
//
// Three rules hold this together, and they are all in 0044 rather than here:
// every seeded box is marked, a seeded crack owes nobody money and writes no
// reward claim, and no invented account is ever created — a seeded winner and
// a seeded hunter are an address on a row, never a player. Addresses are shown
// masked exactly as a real hunter's is.
//
// This module is the shape of what the admin screen sends and the order the
// three functions have to run in.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { EMAIL_REGEX } from "@/lib/constants";
import { PUBLIC_BOX_COLUMNS, type BoxRow } from "@/lib/game/boxes";

type Db = ReturnType<typeof supabaseAdmin>;

/** Ten lanes on the chase, so ten names at the outside. */
export const SEED_MAX = 10;

export interface SeedHunter {
  email: string;
  percent: number;
}

export interface SeedRequest {
  attemptsCount?: number;
  playersCount?: number;
  /** The winner's address. Present means "mark this cracked". */
  crackedBy?: string;
  /** ISO date. Defaults to now. */
  crackedAt?: string;
  /** The leaderboard. Present — even empty — replaces whatever is there. */
  hunters?: unknown;
}

/**
 * What an admin typed into the seeding fields, cleaned.
 *
 * Rows without a plausible address are dropped rather than rejected: this is a
 * table of five, three of which are usually left empty, and refusing the whole
 * save because row four is blank is a strange way to treat somebody filling in
 * a form.
 */
export function readHunters(raw: unknown): SeedHunter[] {
  if (!Array.isArray(raw)) return [];
  const out: SeedHunter[] = [];
  for (const entry of raw) {
    const row = (entry ?? {}) as { email?: unknown; percent?: unknown };
    const email = String(row.email ?? "").trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) continue;
    const percent = Number(row.percent ?? 0);
    out.push({
      email,
      percent: Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0,
    });
    if (out.length >= SEED_MAX) break;
  }
  return out;
}

/**
 * Apply whatever a request asked for, in the order that matters.
 *
 * The counters and the leaderboard first, the crack last: `seed_crack` closes
 * the box and clears its feature flag, so doing it first would leave the other
 * two editing something already finished.
 *
 * Every step is guarded in SQL as well — none of the three will touch a box
 * that isn't ours, because a contributor's box has real money behind it and a
 * real player expecting to be able to win it.
 */
export async function applySeeding(
  db: Db,
  boxId: string,
  body: SeedRequest,
  by: string
): Promise<{ box: BoxRow | null; changed: string[] }> {
  const changed: string[] = [];

  const attempts = Math.trunc(Number(body.attemptsCount ?? 0));
  const players = Math.trunc(Number(body.playersCount ?? 0));
  if (Number.isFinite(attempts) && Number.isFinite(players) && (attempts > 0 || players > 0)) {
    const { error } = await db.rpc("seed_counts", {
      p_box_id: boxId,
      p_attempts: Math.max(0, attempts),
      p_players: Math.max(0, players),
      p_by: by,
    });
    if (error) console.error("[seed] counts failed:", error);
    else changed.push("counts");
  }

  // Present at all — even as an empty list — replaces the board. That is how
  // a row is removed: take it out of the table and save.
  if (Array.isArray(body.hunters)) {
    const { error } = await db.rpc("set_box_seeds", {
      p_box_id: boxId,
      p_rows: readHunters(body.hunters),
      p_by: by,
    });
    if (error) console.error("[seed] hunters failed:", error);
    else changed.push("hunters");
  }

  const winner = (body.crackedBy ?? "").trim().toLowerCase();
  if (EMAIL_REGEX.test(winner)) {
    const when = body.crackedAt ? new Date(body.crackedAt) : new Date();
    const { error } = await db.rpc("seed_crack", {
      p_box_id: boxId,
      p_winner: winner,
      p_when: (Number.isNaN(when.getTime()) ? new Date() : when).toISOString(),
      p_by: by,
    });
    if (error) console.error("[seed] crack failed:", error);
    else changed.push("cracked");
  }

  if (changed.length === 0) return { box: null, changed };

  const { data } = await db
    .from("boxes")
    .select(PUBLIC_BOX_COLUMNS)
    .eq("id", boxId)
    .maybeSingle();
  return { box: (data as BoxRow | null) ?? null, changed };
}

/** The names currently seeded onto one box, in the order they are shown. */
export async function readSeededHunters(db: Db, boxId: string): Promise<SeedHunter[]> {
  const { data } = await db
    .from("box_seeds")
    .select("email, percent")
    .eq("box_id", boxId)
    .order("rank");

  return ((data ?? []) as { email: string; percent: string | number }[]).map((row) => ({
    email: row.email,
    percent: Number(row.percent ?? 0),
  }));
}
