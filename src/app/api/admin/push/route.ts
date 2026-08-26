import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { pushConfigured, sendPush, type PushTarget } from "@/lib/push";

/**
 * The segments a message may be aimed at.
 *
 * Named here rather than taken as a `where` clause from the browser, for the
 * same reason the users list names its sorts: this decides who gets woken up,
 * and that is not a decision to accept from a query string.
 *
 * `idle` is the one this was built for — somebody who subscribed, played, and
 * then stopped. Three days is the floor because anything shorter is not a
 * lapsed player, it is a player who is asleep.
 */
const SEGMENTS = {
  all: () => true,
  idle: (t: Target) => t.days_idle >= 3 && t.days_idle < 30,
  gone: (t: Target) => t.days_idle >= 30,
  never_played: (t: Target) => t.attempts === 0,
} as const;

type Segment = keyof typeof SEGMENTS;

interface Target {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  days_idle: number;
  attempts: number;
}

const TITLE_MAX = 60;
const BODY_MAX = 140;

/** Who could be reached, by segment. Read before anybody presses send. */
export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin()
    .from("admin_push_audience")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[admin] push audience failed:", error);
    if (error.code === "PGRST205" || error.code === "PGRST204") {
      return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    }
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const row = (data ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    configured: pushConfigured(),
    audience: {
      total: Number(row.total ?? 0),
      players: Number(row.players ?? 0),
      idle: Number(row.idle_short ?? 0),
      gone: Number(row.idle_long ?? 0),
      neverPlayed: Number(row.never_played ?? 0),
      failing: Number(row.failing ?? 0),
    },
  });
}

/**
 * Send one message to one segment.
 *
 * There is no scheduling, no campaign object and no history table, and that is
 * deliberate for a first version: the thing that makes push cheap is that it
 * has no moving parts, and the thing that makes it *expensive* is sending too
 * much. A screen where somebody has to type the words and press the button
 * every time is a rate limit made of friction.
 */
export async function POST(req: Request) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pushConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    segment?: string;
    title?: string;
    message?: string;
    url?: string;
    test?: boolean;
  };

  const segment = (body.segment ?? "idle") as Segment;
  const match = SEGMENTS[segment];
  if (!match) return NextResponse.json({ error: "unknown_segment" }, { status: 400 });

  const title = (body.title ?? "").trim().slice(0, TITLE_MAX);
  const message = (body.message ?? "").trim().slice(0, BODY_MAX);
  if (!title || !message) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

  // A path, never an absolute URL: the service worker resolves it against our
  // own origin, so a typo can't send every subscriber to somebody else's site.
  const url = (body.url ?? "/").trim();
  if (!url.startsWith("/") || url.startsWith("//")) {
    return NextResponse.json({ error: "bad_url" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("admin_push_targets")
    .select("id, endpoint, p256dh, auth, days_idle, attempts");

  if (error) {
    console.error("[admin] push targets failed:", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const all = (data ?? []) as Target[];
  const targets: PushTarget[] = all
    .filter(match)
    // A dry run sends to nobody and reports the count, so the number can be
    // checked against the copy before anybody's phone buzzes.
    .slice(0, body.test ? 0 : undefined)
    .map((t) => ({ id: t.id, endpoint: t.endpoint, p256dh: t.p256dh, auth: t.auth }));

  const matched = all.filter(match).length;
  if (body.test) {
    return NextResponse.json({ result: "dry_run", matched, sent: 0, gone: 0, failed: 0 });
  }

  const outcome = await sendPush(targets, {
    title,
    body: message,
    url,
    // One tag per segment, so a second message to the same people replaces the
    // first on the lock screen rather than stacking beneath it.
    tag: `spendbox-${segment}`,
  });

  return NextResponse.json({ result: "sent", matched, ...outcome });
}
