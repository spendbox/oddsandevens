import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { ensurePlayer } from "@/lib/game/boxes";
import { pushConfigured } from "@/lib/push";

/**
 * A browser's push subscription, stored and forgotten.
 *
 * The permission itself lives in the browser and always will — the toggle in
 * `/me` cannot grant it, cannot revoke it once granted, and cannot lie about
 * it. That is the whole reason push is the honest channel: consent is held by
 * the person giving it, in a place we have no access to, and "unsubscribe" is
 * a browser setting rather than a link at the bottom of something.
 *
 * All this route does is remember where to send.
 */

interface Incoming {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

/** Whether push is switched on for this deployment, and for this browser. */
export async function GET() {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  const player = await ensurePlayer(supabaseAdmin(), email);
  if (!player) return NextResponse.json({ configured: pushConfigured(), count: 0 });

  const { count } = await supabaseAdmin()
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("player_id", player.id);

  return NextResponse.json({ configured: pushConfigured(), count: count ?? 0 });
}

/**
 * Remember a subscription.
 *
 * Called on every visit by a browser that already has one, not only when the
 * toggle is flipped — a subscription can be rotated by the push service at any
 * time, and the only way to notice is for the browser to keep telling us what
 * it currently holds. So this is an upsert on the endpoint and is expected to
 * do nothing most of the time.
 *
 * `replaces` is the rotation case: the service worker re-subscribed after the
 * old endpoint was retired, and the dead row would otherwise sit in the table
 * until the first 410.
 */
export async function POST(req: Request) {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    subscription?: Incoming;
    replaces?: string | null;
  };
  const sub = body.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;

  // All three or nothing: a row missing a key is a row every future send will
  // throw on, and there is no way to repair it later.
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  }
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 2000) {
    return NextResponse.json({ error: "invalid_endpoint" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const player = await ensurePlayer(db, email);
  if (!player) return NextResponse.json({ error: "no_player" }, { status: 400 });

  const now = new Date().toISOString();
  const { error } = await db.from("push_subscriptions").upsert(
    {
      player_id: player.id,
      endpoint,
      p256dh,
      auth,
      // Only ever used to tell a phone from a laptop in the admin list.
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 200) || null,
      renewed_at: now,
      // A browser that is talking to us again is not a failing one, whatever
      // it did last week.
      failures: 0,
      last_failed_at: null,
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    console.error("[push] subscribe failed:", error);
    if (error.code === "PGRST205" || error.code === "PGRST204") {
      return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    }
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  if (body.replaces && body.replaces !== endpoint) {
    await db.from("push_subscriptions").delete().eq("endpoint", body.replaces);
  }

  return NextResponse.json({ result: "subscribed" });
}

/**
 * Forget one.
 *
 * The browser has already unsubscribed by the time this arrives, so a failure
 * here is untidy rather than harmful — the endpoint is dead and the first send
 * to it will prune it anyway. It is still worth doing straight away, because
 * "I turned it off" and "it stopped after the next message" are different
 * promises.
 */
export async function DELETE(req: Request) {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  const db = supabaseAdmin();
  const player = await ensurePlayer(db, email);
  if (!player) return NextResponse.json({ result: "gone" });

  // Scoped to the player as well as the endpoint: an endpoint is a bearer
  // string, and one browser must not be able to unsubscribe another's.
  let request = db.from("push_subscriptions").delete().eq("player_id", player.id);
  if (endpoint) request = request.eq("endpoint", endpoint);

  const { error } = await request;
  if (error) console.error("[push] unsubscribe failed:", error);
  return NextResponse.json({ result: "gone" });
}
