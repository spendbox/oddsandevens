// Sending a push, and throwing away the ones that can't receive one.
//
// The whole of the cost story is in the second half of that sentence. There is
// no per-message price on web push and never will be — but a subscription list
// rots on its own, because a browser that clears its data, a phone that is
// wiped, an app that is uninstalled all leave an endpoint behind that will
// answer 410 for ever. A sender that ignores that spends longer and longer
// doing nothing, and its delivery figures drift away from the truth until they
// mean nothing at all. So a dead endpoint is deleted the first time it says so.
//
// Nothing here throws. A push is an interruption we chose to send; a player
// whose browser has gone away is not an error condition, and no caller of this
// is in a position to do anything about one.

import webpush, { type PushSubscription, type WebPushError } from "web-push";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * How many soft failures a subscription survives.
 *
 * A 404 or 410 is deleted on sight — the push service is telling us the thing
 * is gone. Everything else (a timeout, a 500, a push service having a bad
 * minute) only counts against it, because deleting on the first one throws
 * away live subscribers to punish somebody else's outage.
 */
const FAILURE_LIMIT = 5;

/** Chrome and Firefox both cap the encrypted payload at 4KB. Stay well under. */
const MAX_PAYLOAD_BYTES = 3000;

export interface PushMessage {
  title: string;
  body: string;
  /** Where a tap goes. A path, not a URL — the service worker resolves it. */
  url?: string;
  /**
   * Collapses notifications: a second message with the same tag replaces the
   * first rather than stacking under it. Anything sent to a whole segment
   * should carry one, or somebody who was away for a week comes back to five.
   */
  tag?: string;
}

export interface PushTarget {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushResult {
  sent: number;
  /** Endpoints the push service said are gone. Already deleted. */
  gone: number;
  /** Soft failures — counted against the subscription, not fatal. */
  failed: number;
}

/**
 * Whether push is configured at all.
 *
 * The same shape as `RESEND_API_KEY`: without keys the feature is simply off,
 * and every surface asks this rather than discovering it from a stack trace.
 * A missing key is a deployment that hasn't been given one yet, which is the
 * normal state of a local checkout.
 */
export function pushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  );
}

let configured = false;

function configure(): boolean {
  if (!pushConfigured()) return false;
  if (configured) return true;
  webpush.setVapidDetails(
    // A contact for the push service to shout at if we misbehave. It must be a
    // mailto: or an https: URL — the spec says so and Firefox enforces it.
    process.env.VAPID_SUBJECT ?? "mailto:spendbox@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
  return true;
}

function payloadFor(message: PushMessage): string {
  const json = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url ?? "/",
    tag: message.tag,
  });
  if (Buffer.byteLength(json) > MAX_PAYLOAD_BYTES) {
    // Truncating the body beats a push service rejecting the whole thing for
    // being over the limit — and the body is the only part long enough to be
    // the cause.
    const room = MAX_PAYLOAD_BYTES - Buffer.byteLength(json) + message.body.length;
    return payloadFor({ ...message, body: message.body.slice(0, Math.max(0, room - 1)) + "…" });
  }
  return json;
}

/**
 * Send one message to many browsers.
 *
 * Sends in batches rather than all at once: a segment of a few thousand opened
 * as a few thousand simultaneous TLS connections is a way to be rate-limited by
 * every push service at the same time, and there is no hurry — nothing is
 * waiting on the result.
 */
export async function sendPush(
  targets: PushTarget[],
  message: PushMessage,
  { batchSize = 100 }: { batchSize?: number } = {}
): Promise<PushResult> {
  const result: PushResult = { sent: 0, gone: 0, failed: 0 };
  if (!configure() || targets.length === 0) return result;

  const payload = payloadFor(message);
  const dead: string[] = [];
  const soft: string[] = [];
  const delivered: string[] = [];

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (target) => {
        const subscription: PushSubscription = {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth },
        };
        try {
          await webpush.sendNotification(subscription, payload, { TTL: 60 * 60 * 24 });
          delivered.push(target.id);
        } catch (err) {
          const status = (err as WebPushError).statusCode;
          // 404: the push service never heard of it. 410: it has been revoked.
          // Both are permanent, and both are the normal end of a subscription's
          // life rather than something going wrong.
          if (status === 404 || status === 410) dead.push(target.id);
          else soft.push(target.id);
        }
      })
    );
  }

  result.sent = delivered.length;
  result.gone = dead.length;
  result.failed = soft.length;
  await record(delivered, dead, soft);
  return result;
}

/**
 * Write the outcome back, and prune. Never lets a bookkeeping error surface.
 *
 * `supabaseAdmin()` is built *inside* the try, which is not fussiness: it
 * throws when the service-role key is missing, and by the time this runs the
 * pushes have already gone out. Constructing it above the try meant a
 * deployment with push keys but no database key delivered every notification
 * and then threw — so the caller saw a failure, and whoever was watching would
 * quite reasonably press send again and wake everybody twice.
 */
async function record(delivered: string[], dead: string[], soft: string[]): Promise<void> {
  try {
    const db = supabaseAdmin();
    if (dead.length > 0) {
      await db.from("push_subscriptions").delete().in("id", dead);
    }
    if (delivered.length > 0) {
      await db
        .from("push_subscriptions")
        .update({ last_sent_at: new Date().toISOString(), failures: 0 })
        .in("id", delivered);
    }
    for (const id of soft) {
      // Read-modify-write rather than a SQL increment, because supabase-js has
      // no `failures = failures + 1`. Soft failures are rare by construction,
      // so this is a handful of rows rather than a pattern.
      const { data } = await db
        .from("push_subscriptions")
        .select("failures")
        .eq("id", id)
        .maybeSingle();
      const failures = Number(data?.failures ?? 0) + 1;
      if (failures >= FAILURE_LIMIT) {
        await db.from("push_subscriptions").delete().eq("id", id);
      } else {
        await db
          .from("push_subscriptions")
          .update({ failures, last_failed_at: new Date().toISOString() })
          .eq("id", id);
      }
    }
  } catch (err) {
    console.error("[push] bookkeeping failed:", err);
  }
}

/** Every browser one player has subscribed — a phone and a laptop is normal. */
export async function targetsForPlayer(playerId: string): Promise<PushTarget[]> {
  const { data, error } = await supabaseAdmin()
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("player_id", playerId);
  if (error) {
    console.error("[push] targets failed:", error);
    return [];
  }
  return (data ?? []) as PushTarget[];
}

/** Send to one player, on every browser they have. Fire and forget. */
export async function pushToPlayer(
  playerId: string,
  message: PushMessage
): Promise<PushResult> {
  return sendPush(await targetsForPlayer(playerId), message);
}
