import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { sendPlayerBroadcastEmail } from "@/lib/email";
import { appBaseUrl } from "@/lib/base-url";

/**
 * Writing to players, by hand.
 *
 * The segments are named here rather than accepted as a filter from the
 * browser, for the same reason the users list names its sorts: this decides
 * whose inbox is used, and that is not a decision to take from a query string.
 *
 * Everything goes through `admin_email_targets`, which excludes anybody who
 * has unsubscribed — the check lives in the view rather than in this file so
 * that a future sender cannot forget it.
 */
const SEGMENTS = {
  all: () => true,
  idle: (t: Target) => t.days_idle >= 3 && t.days_idle < 30,
  gone: (t: Target) => t.days_idle >= 30,
  never_played: (t: Target) => t.attempts === 0,
  spenders: (t: Target) => t.spent_kobo > 0,
} as const;

type Segment = keyof typeof SEGMENTS;

interface Target {
  player_id: string;
  email: string;
  days_idle: number;
  attempts: number;
  spent_kobo: number;
}

const SUBJECT_MAX = 120;
const BODY_MAX = 4000;

/*
 * Resend's free tier is on the order of 100 a day. Sending more than this in
 * one press is also a reputation decision rather than only a quota one — a
 * cold list hit all at once is how a domain gets filtered, and the domain in
 * question also carries the six-digit codes people log in with.
 */
const BATCH_MAX = 200;

export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin()
    .from("admin_email_audience")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[admin] email audience failed:", error);
    if (error.code === "PGRST205" || error.code === "PGRST204") {
      return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    }
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const row = (data ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    configured: Boolean(process.env.RESEND_API_KEY),
    batchMax: BATCH_MAX,
    audience: {
      total: Number(row.total ?? 0),
      idle: Number(row.idle ?? 0),
      gone: Number(row.gone ?? 0),
      neverPlayed: Number(row.never_played ?? 0),
      spenders: Number(row.spenders ?? 0),
      unsubscribed: Number(row.unsubscribed ?? 0),
    },
  });
}

export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    segment?: string;
    subject?: string;
    message?: string;
    test?: boolean;
    /** Send only to this address, whatever the segment says. */
    onlyTo?: string;
  };

  const segment = (body.segment ?? "idle") as Segment;
  const match = SEGMENTS[segment];
  if (!match) return NextResponse.json({ error: "unknown_segment" }, { status: 400 });

  const subject = (body.subject ?? "").trim().slice(0, SUBJECT_MAX);
  const message = (body.message ?? "").trim().slice(0, BODY_MAX);
  if (!subject || !message) return NextResponse.json({ error: "empty" }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("admin_email_targets")
    .select("player_id, email, days_idle, attempts, spent_kobo");

  if (error) {
    console.error("[admin] email targets failed:", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const all = (data ?? []) as Target[];
  let matched = all.filter(match);

  // A test send goes to one real address so the copy can be read in a real
  // inbox, with a real unsubscribe link, before anybody else gets it.
  if (body.onlyTo) {
    const one = all.find((t) => t.email.toLowerCase() === body.onlyTo!.trim().toLowerCase());
    if (!one) return NextResponse.json({ error: "not_a_player" }, { status: 404 });
    matched = [one];
  }

  if (body.test && !body.onlyTo) {
    return NextResponse.json({ result: "dry_run", matched: matched.length, sent: 0 });
  }

  const batch = matched.slice(0, BATCH_MAX);
  const base = appBaseUrl(req);
  let sent = 0;

  for (const target of batch) {
    // Minted per player and never regenerated, so a link in a message sent
    // last month still works.
    const { data: token } = await db.rpc("unsubscribe_token", { p_player_id: target.player_id });
    if (!token) continue;
    await sendPlayerBroadcastEmail({
      to: target.email,
      subject,
      body: message,
      unsubscribeUrl: `${base}/unsubscribe?t=${token}`,
    });
    sent += 1;
  }

  console.log(`[admin] broadcast "${subject}" to ${sent} by ${admin.email}`);
  return NextResponse.json({
    result: "sent",
    matched: matched.length,
    sent,
    truncated: matched.length > BATCH_MAX,
  });
}
