import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { pushConfigured, sendPush, type PushTarget } from "@/lib/push";

/**
 * Once a day: tell the people whose lives are full and who aren't here.
 *
 * The pool refills on a clock whether or not anybody is watching, so a full
 * pool is the moment a lapsed player has the most to come back to and the
 * least reason to know it. That is the whole notification.
 *
 * **Who it skips is the design.** `players_due_lives_push` refuses anybody
 * seen in the last two days: somebody playing today knows what their life
 * count is, and telling them is how a useful notification becomes a nuisance
 * people switch off. It also refuses anybody told inside the last twenty
 * hours, in SQL rather than by trusting the scheduler — a scheduler firing
 * twice is a normal thing for a scheduler to do.
 *
 * Only stamped for the players a push actually went to, so a run that fails
 * halfway leaves the rest due tomorrow rather than silently spent.
 */

/** Vercel calls cron routes with `Authorization: Bearer $CRON_SECRET`. */
function fromScheduler(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  // An administrator may fire it by hand, which is the only way to test it
  // without waiting a day.
  if (!fromScheduler(req) && !(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pushConfigured()) {
    return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("players_due_lives_push");
  if (error) {
    console.error("[cron] lives-full due list failed:", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const due = (data ?? []) as { player_id: string; lives: number; lives_max: number }[];
  if (due.length === 0) return NextResponse.json({ due: 0, sent: 0, gone: 0 });

  const ids = due.map((d) => d.player_id);
  const { data: subs, error: subError } = await db
    .from("push_subscriptions")
    .select("id, player_id, endpoint, p256dh, auth")
    .in("player_id", ids);
  if (subError) {
    console.error("[cron] lives-full subscriptions failed:", subError);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const rows = (subs ?? []) as (PushTarget & { player_id: string })[];
  const lives = new Map(due.map((d) => [d.player_id, d.lives]));

  /*
   * Grouped by player, so the message can say *their* number.
   *
   * "Your 7 lives are back" is a fact about them; "your lives are back" is a
   * template. It costs one map and is the difference between a notification
   * that reads as addressed and one that reads as a mailshot.
   */
  const byCount = new Map<number, PushTarget[]>();
  for (const row of rows) {
    const count = lives.get(row.player_id) ?? 0;
    const list = byCount.get(count) ?? [];
    list.push({ id: row.id, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });
    byCount.set(count, list);
  }

  let sent = 0;
  let gone = 0;
  const reached = new Set<string>();
  const byId = new Map(rows.map((r) => [r.id, r.player_id]));

  for (const [count, targets] of byCount) {
    const outcome = await sendPush(targets, {
      title: `Your ${count} lives are back`,
      body: "That's a full pool waiting on a safe. Pick up where you left off.",
      url: "/",
      // One tag, so a player who ignores three days of these comes back to one
      // notification rather than three.
      tag: "spendbox-lives-full",
    });
    sent += outcome.sent;
    gone += outcome.gone;
    if (outcome.sent > 0) {
      for (const t of targets) {
        const player = byId.get(t.id);
        if (player) reached.add(player);
      }
    }
  }

  // Stamped last, and only for players a push went to.
  if (reached.size > 0) {
    await db.rpc("mark_lives_push", { p_player_ids: [...reached] });
  }

  console.log(`[cron] lives-full: ${due.length} due, ${sent} sent, ${gone} pruned`);
  return NextResponse.json({ due: due.length, sent, gone, notified: reached.size });
}
