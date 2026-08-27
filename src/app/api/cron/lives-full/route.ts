import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { pushConfigured, sendPush, type PushTarget } from "@/lib/push";

/**
 * Tell the people whose lives are full: the ones who asked, and the ones who
 * have drifted away and don't know.
 *
 * The pool refills on a clock whether or not anybody is watching, so a full
 * pool is the moment a lapsed player has the most to come back to and the
 * least reason to know it. That is the whole notification.
 *
 * **Two lists, and the difference between them is consent.**
 *
 *  - `players_watching_lives_full` is people who stood at an empty pool,
 *    declined to buy anything, and asked to be told when it filled. They are
 *    served first and the idle rule does not apply to them: somebody who ran
 *    out this evening is by definition here today, and refusing an invited
 *    notification for that reason would refuse it to everybody who ever asks.
 *    A watch is spent by the push it earns.
 *  - `players_due_lives_push` is the uninvited nudge, and who it skips is the
 *    design: anybody seen in the last two days, because somebody playing today
 *    knows what their life count is, and anybody told inside the last twenty
 *    hours. Both are enforced in SQL rather than by trusting the scheduler —
 *    a scheduler firing twice is a normal thing for a scheduler to do, and
 *    those windows are what make this route safe to run as often as it likes.
 *
 * **It runs once a day**, which is why the dialog that takes the request says
 * so rather than promising the moment the pool fills. A watch survives being
 * served late: the condition is "full now", so somebody who came back and
 * spent the lives in the meantime is simply not sent anything, and their watch
 * waits for the next time the pool is actually full.
 *
 * The two lists are disjoint by construction, so nobody is sent the same
 * notification twice in one run. Bookkeeping happens last and only for players
 * a push actually reached, so a run that fails halfway leaves the rest due on
 * the next one rather than silently spent.
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
  const [watching, drifted] = await Promise.all([
    db.rpc("players_watching_lives_full"),
    db.rpc("players_due_lives_push"),
  ]);
  const failure = watching.error ?? drifted.error;
  if (failure) {
    console.error("[cron] lives-full due list failed:", failure);
    // A deployment that has not run 0064 yet still has the daily nudge; it is
    // the watch list that is missing, and saying so beats a bare 500.
    if (failure.code === "PGRST202" || failure.code === "PGRST205") {
      return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    }
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  type Due = { player_id: string; lives: number; lives_max: number };
  const asked = (watching.data ?? []) as Due[];
  const askedIds = new Set(asked.map((d) => d.player_id));
  // Belt and braces: the two queries already exclude each other, and a player
  // in both lists would otherwise be two entries in the same count bucket and
  // so two identical pushes to the same browser.
  const due = [...asked, ...((drifted.data ?? []) as Due[]).filter((d) => !askedIds.has(d.player_id))];
  if (due.length === 0) {
    return NextResponse.json({ due: 0, asked: 0, sent: 0, gone: 0 });
  }

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

  /*
   * Bookkeeping last, and only for players a push went to.
   *
   * A watch is spent rather than stamped — `clear_lives_watch` does both, so a
   * player who asked is not then picked up by the uninvited nudge tomorrow —
   * and everybody else is stamped as told.
   */
  if (reached.size > 0) {
    const spent = [...reached].filter((id) => askedIds.has(id));
    const nudged = [...reached].filter((id) => !askedIds.has(id));
    if (spent.length > 0) await db.rpc("clear_lives_watch", { p_player_ids: spent });
    if (nudged.length > 0) await db.rpc("mark_lives_push", { p_player_ids: nudged });
  }

  console.log(
    `[cron] lives-full: ${due.length} due (${asked.length} asked), ${sent} sent, ${gone} pruned`
  );
  return NextResponse.json({
    due: due.length,
    asked: asked.length,
    sent,
    gone,
    notified: reached.size,
  });
}
