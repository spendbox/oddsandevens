// Paying without leaving the game.
//
// Every purchase used to be `window.location.assign(authorizationUrl)`: the
// page went away, Paystack's page arrived, and coming back was a fresh server
// render of the play screen. On a page you buy from *mid-hunt* that is the
// wrong shape entirely. It threw away the scene, the result card, the guess you
// had half-typed and the scroll position, and it did it at the exact moment a
// player had run out of lives three characters from an answer — which is to
// say, at the moment they were most likely to give up instead.
//
// So the card form opens over the top now. Paystack's inline script resumes the
// transaction we already started on the server, takes the payment in an iframe,
// and hands control back to a page that never unmounted.
//
// **Nothing about trust changes**, and that is the point worth being explicit
// about. The browser is not told what was paid and is not believed about it:
// the transaction is initialised server-side with a server-set amount, and
// `/api/payments/verify` asks Paystack directly what happened before anything
// is credited. The callbacks below are a *user interface* signal — they decide
// what we say and when we refresh, never what a player gets. A tampered client
// can call `onSuccess` all it likes and receive nothing.
//
// The redirect is kept, as a fallback rather than a path. An ad blocker, a
// corporate proxy or a network that drops js.paystack.co all end with a browser
// that cannot open the inline form, and the honest answer there is the old
// full-page checkout rather than a dead button.

/** What the three checkout routes hand back. */
export interface CheckoutStart {
  result?: string;
  authorizationUrl?: string;
  accessCode?: string;
  reference?: string;
  /** Present instead of the two above when the player chose a bank transfer. */
  transfer?: {
    bankName: string;
    accountNumber: string;
    accountName: string;
    amountKobo: number;
    expiresAt: string | null;
  };
}

/** A transfer is finished by the sheet, not by this module. */
export function isTransfer(
  body: CheckoutStart
): body is CheckoutStart & { transfer: NonNullable<CheckoutStart["transfer"]>; reference: string } {
  return body.result === "transfer" && !!body.transfer && !!body.reference;
}

export type CheckoutOutcome =
  /** Paid, and verified with our server. */
  | "paid"
  /** They closed the form. Nothing was charged. */
  | "cancelled"
  /** The inline form could not open; the browser is on its way to Paystack. */
  | "redirected"
  /** Nothing usable came back from the server. */
  | "failed";

const SCRIPT = "https://js.paystack.co/v2/inline.js";

interface PaystackPopup {
  resumeTransaction(
    accessCode: string,
    callbacks?: {
      onSuccess?: (transaction: { reference?: string }) => void;
      onCancel?: () => void;
      onError?: (error: unknown) => void;
      onLoad?: (response: unknown) => void;
    }
  ): void;
}

declare global {
  interface Window {
    PaystackPop?: new () => PaystackPopup;
  }
}

/**
 * The inline script, fetched at most once per page.
 *
 * The promise is memoised rather than the element checked, because two dialogs
 * can ask on the same tick — the shelf and the lives sheet are both reachable
 * without dismissing the other — and two `<script>` tags for the same file is a
 * second download and a second global.
 */
let loading: Promise<boolean> | null = null;

function loadPaystack(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.PaystackPop) return Promise.resolve(true);
  if (loading) return loading;

  loading = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    const el = existing ?? document.createElement("script");
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok && !!window.PaystackPop);
    };

    // A script that neither loads nor errors — a captive portal, a proxy that
    // holds the connection open — would otherwise leave the button spinning
    // forever. Eight seconds, then take the redirect.
    const timer = window.setTimeout(() => done(false), 8_000);
    el.addEventListener("load", () => {
      window.clearTimeout(timer);
      done(true);
    });
    el.addEventListener("error", () => {
      window.clearTimeout(timer);
      done(false);
    });

    if (!existing) {
      el.src = SCRIPT;
      el.async = true;
      document.head.appendChild(el);
    }
  }).finally(() => {
    // Cleared either way: a failed load should be retried on the next attempt
    // rather than remembered as permanently broken for the life of the tab.
    loading = null;
  });

  return loading;
}

/**
 * Open the card form over the current page and settle whatever happens.
 *
 * `onSettled` runs after a successful payment has been verified *by the
 * server*, and is where a caller refreshes its view. It is deliberately not
 * given the transaction: there is nothing in it a caller should be acting on.
 */
export async function openCheckout(
  start: CheckoutStart,
  onSettled?: (note: string | null) => void | Promise<void>
): Promise<CheckoutOutcome> {
  const { accessCode, authorizationUrl, reference } = start;

  const redirect = (): CheckoutOutcome => {
    if (!authorizationUrl) return "failed";
    window.location.assign(authorizationUrl);
    return "redirected";
  };

  if (!accessCode || !reference) return redirect();
  if (!(await loadPaystack())) return redirect();

  const Popup = window.PaystackPop;
  if (!Popup) return redirect();

  const outcome = await new Promise<"paid" | "cancelled">((resolve) => {
    try {
      new Popup().resumeTransaction(accessCode, {
        onSuccess: () => resolve("paid"),
        // A cancel and an error are the same thing to the player — the form
        // went away and no money moved — and both are verified anyway, so a
        // transaction that actually succeeded before an error is still caught.
        onCancel: () => resolve("cancelled"),
        onError: () => resolve("cancelled"),
      });
    } catch {
      resolve("cancelled");
    }
  });

  if (outcome === "cancelled") return "cancelled";

  const note = await verify(reference);
  await onSettled?.(note);
  return "paid";
}

/**
 * Ask our own server what a reference is worth.
 *
 * The same endpoint the return-from-redirect trip uses, and it is safe to call
 * twice: settlement flips a status with a conditional update and everything
 * downstream hangs off that update having matched a row.
 */
async function verify(reference: string): Promise<string | null> {
  try {
    const res = await fetch("/api/payments/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
    });
    const body = (await res.json().catch(() => ({}))) as { note?: string };
    return body.note ?? null;
  } catch {
    // The payment happened; only our confirmation of it didn't. The webhook
    // settles it regardless, so the worst case is a refresh away.
    return null;
  }
}
