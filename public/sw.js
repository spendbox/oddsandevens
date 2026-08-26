/*
 * Spendbox service worker.
 *
 * It does exactly one job — notifications — and deliberately does not cache
 * anything. A game whose whole surface is live server state (a life count, a
 * best score, whether a box is still open) is one where a stale cached page is
 * worse than no page: it would show somebody seven lives they don't have, or a
 * safe that was cracked an hour ago. Offline support here would be a lie about
 * the thing it is offline from.
 *
 * Kept in `public/` rather than generated, so it is served from the origin root
 * and its scope is the whole site. A worker under `/_next/` could only ever
 * control `/_next/`.
 */

// Take over as soon as a new version lands, rather than waiting for every tab
// to close. Nothing here holds state worth preserving across versions.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/*
 * A push arrived.
 *
 * The payload is JSON we sent ourselves, but it is parsed defensively anyway:
 * a push service may deliver an empty push to wake the worker, and Chrome
 * shows its own "This site has been updated in the background" notice if the
 * handler finishes without showing one. That default notice is worse than
 * anything we would write, so there is always a fallback.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "Spendbox";
  const options = {
    body: data.body || "Something is happening on a safe you were hunting.",
    // Drawn rather than downloaded, like everything else here.
    icon: "/icon-192.png",
    badge: "/badge.png",
    // Collapses repeats: a second message with the same tag replaces the first
    // instead of stacking under it.
    tag: data.tag || "spendbox",
    renotify: Boolean(data.tag),
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/*
 * Somebody tapped it.
 *
 * Focus a tab that is already open on the site rather than opening a second
 * one — a player who left the game open and tapped a notification should land
 * back in the game they left, with its state intact, not in a fresh copy of it
 * beside the old one.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === target.origin && "focus" in client) {
          client.navigate(target.href);
          return client.focus();
        }
      }
      return self.clients.openWindow(target.href);
    })
  );
});

/*
 * The browser rotated the subscription out from under us.
 *
 * This fires when a push service retires an endpoint — and if nothing handles
 * it the subscription is simply lost, silently, while our table goes on
 * believing it is live until the first 410. Re-subscribing with the same keys
 * and telling the server is the whole fix, and it is the single most-skipped
 * part of a push implementation.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription || (await self.registration.pushManager.getSubscription());
      const key = event.oldSubscription?.options?.applicationServerKey;
      if (!key) return;

      const fresh = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });

      await fetch("/api/player/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subscription: fresh.toJSON(),
          replaces: old ? old.endpoint : null,
        }),
      });
    })()
  );
});
