// The browser half of push: register, subscribe, tell the server.
//
// Kept out of the component so the two places that need it — the toggle in
// `/me` and the prompt after a win — cannot drift into two slightly different
// subscribe flows, which is how a feature ends up working on one screen and
// silently not on the other.

/**
 * The public VAPID key, as the browser wants it: raw bytes, not base64url.
 *
 * Backed by an explicit `ArrayBuffer` rather than `Uint8Array.from`, because
 * `subscribe()` takes a `BufferSource` and the inferred `ArrayBufferLike` of
 * the convenience constructors does not satisfy it.
 */
function applicationServerKey(base64: string): Uint8Array<ArrayBuffer> {
  // base64url → base64, then padded. `atob` accepts neither the URL alphabet
  // nor a missing pad, and the key as published is both.
  const padded = base64.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export type PushSupport =
  /** Everything is here and push can be asked for. */
  | "ready"
  /** Configured for this browser but the deployment has no VAPID keys. */
  | "unconfigured"
  /**
   * iOS Safari, in a tab. Apple allows push only from a site that has been
   * added to the Home Screen — the APIs are simply absent otherwise, so there
   * is nothing to prompt and the honest answer is an instruction, not a button.
   */
  | "ios-needs-install"
  /** No service worker or no push API at all. */
  | "unsupported";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";

  const iOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as a Mac; the touch points give it away.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own, non-standard, and the only one that works on iOS.
    ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return iOS && !standalone ? "ios-needs-install" : "unsupported";
  }
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return "unconfigured";
  return "ready";
}

/** The permission as the browser currently holds it. */
export function pushPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

async function worker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  // `ready` rather than the register() promise: registration resolves as soon
  // as the file is fetched, while a subscribe needs an *active* worker, and
  // subscribing against an installing one throws.
  if (existing) return navigator.serviceWorker.ready;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

/**
 * Ask, subscribe, and register with the server.
 *
 * Returns false for a refusal rather than throwing, because a player saying no
 * is an ordinary answer and every caller has to handle it anyway.
 */
export async function enablePush(): Promise<boolean> {
  if (pushSupport() !== "ready") return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration = await worker();
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      // Required to be true by every browser: a push must result in something
      // the person can see. We would not want the other kind anyway.
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
      ),
    }));

  const res = await fetch("/api/player/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  return res.ok;
}

/** Unsubscribe in the browser, then tell the server to forget the endpoint. */
export async function disablePush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();

  // Told first, while the endpoint is still known. Unsubscribing first and
  // then failing to reach the server would leave a row nothing can name.
  await fetch("/api/player/push", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription?.endpoint ?? null }),
  }).catch(() => {});

  await subscription?.unsubscribe();
}

/** Is this browser subscribed right now? Asks the browser, not the server. */
export async function pushEnabled(): Promise<boolean> {
  if (pushSupport() !== "ready" || pushPermission() !== "granted") return false;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return Boolean(await registration?.pushManager.getSubscription());
}

/**
 * Re-register a subscription this browser already has.
 *
 * Cheap, idempotent, and the only thing that keeps the table honest: a
 * subscription can be rotated or a row can be pruned by a failed send, and
 * neither tells the browser. Called on load wherever a player is resolved.
 */
export async function refreshPush(): Promise<void> {
  try {
    if (!(await pushEnabled())) return;
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await fetch("/api/player/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
  } catch {
    // Nothing depends on this succeeding.
  }
}
