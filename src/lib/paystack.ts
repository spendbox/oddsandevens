// Thin Paystack REST client (transaction initialize + verify). Uses the
// secret key from PAYSTACK_SECRET_KEY; both helpers return null on any
// failure and log the reason — callers translate that into API errors.

const PAYSTACK_BASE = "https://api.paystack.co";

function secretKey(): string | null {
  return process.env.PAYSTACK_SECRET_KEY ?? null;
}

export function paystackConfigured(): boolean {
  return !!secretKey();
}

/**
 * Start a transaction, and hand back both ways of finishing it.
 *
 * `accessCode` is what Paystack's inline script resumes, so the card form opens
 * over the game instead of replacing it. `authorizationUrl` is the same
 * transaction as a full page, kept as the fallback for a browser that cannot
 * load the script — an ad blocker, a locked-down network, an old phone. Both
 * point at one transaction and one reference, so whichever route a player takes
 * the settlement is identical and neither can be paid twice.
 */
export async function initializeTransaction(params: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
}): Promise<{ authorizationUrl: string; accessCode: string } | null> {
  const key = secretKey();
  if (!key) return null;
  try {
    const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: params.email,
        amount: params.amountKobo,
        reference: params.reference,
        callback_url: params.callbackUrl,
      }),
    });
    const body = await res.json();
    // The access code is required, not optional: without it every checkout
    // silently falls back to a full-page redirect, which is the behaviour this
    // is here to replace, and it would fail invisibly.
    if (
      !res.ok ||
      !body?.status ||
      !body?.data?.authorization_url ||
      !body?.data?.access_code
    ) {
      console.error("[paystack] initialize failed:", body);
      return null;
    }
    return {
      authorizationUrl: body.data.authorization_url,
      accessCode: String(body.data.access_code),
    };
  } catch (err) {
    console.error("[paystack] initialize threw:", err);
    return null;
  }
}

export async function verifyTransaction(
  reference: string
): Promise<{ status: string; success: boolean; amountKobo: number } | null> {
  const key = secretKey();
  if (!key) return null;
  try {
    const res = await fetch(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${key}` } }
    );
    const body = await res.json();
    if (!res.ok || !body?.status) {
      console.error("[paystack] verify failed:", body);
      return null;
    }
    // `data.status` is the transaction state: success / failed / abandoned /
    // reversed, or an in-flight state (pending / ongoing / processing) —
    // common for test bank transfers that settle a moment later.
    const status = String(body.data?.status ?? "");
    return {
      status,
      success: status === "success",
      amountKobo: Number(body.data?.amount ?? 0),
    };
  } catch (err) {
    console.error("[paystack] verify threw:", err);
    return null;
  }
}

// Terminal failure states — anything else that isn't "success" is still in
// flight and should not be marked failed (the webhook will settle it).
export function isTerminalFailure(status: string): boolean {
  return ["failed", "abandoned", "reversed"].includes(status);
}

// ---------------------------------------------------------------------------
// Payout accounts.
//
// Every payment now lands whole in the Spendbox balance, and both shares of it
// are written onto the order at the moment of sale. Contributors are paid out
// of that by hand, weekly, against the ledger on the admin screen — so nothing
// here creates a Paystack subaccount any more. What is left is the two calls
// that make an account safe to pay: the bank list, and resolving a number to
// the name on it before anybody sends anything to it.
// ---------------------------------------------------------------------------

export interface Bank {
  name: string;
  code: string;
}

/** The banks Paystack can settle to. Cached by the route, not here. */
export async function listBanks(): Promise<Bank[] | null> {
  const key = secretKey();
  if (!key) return null;
  try {
    const res = await fetch(
      `${PAYSTACK_BASE}/bank?country=nigeria&currency=NGN&perPage=200`,
      { headers: { Authorization: `Bearer ${key}` } }
    );
    const body = await res.json();
    if (!res.ok || !body?.status || !Array.isArray(body.data)) {
      console.error("[paystack] bank list failed:", body);
      return null;
    }
    return (body.data as { name: string; code: string }[])
      .map((b) => ({ name: b.name, code: b.code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error("[paystack] bank list threw:", err);
    return null;
  }
}

/**
 * Whose account this is, according to the bank.
 *
 * The point is not validation, it's the name: a business typing its own
 * account number wrong gets told whose account it actually reached before any
 * money is pointed at it.
 */
export async function resolveAccount(params: {
  accountNumber: string;
  bankCode: string;
}): Promise<{ accountName: string } | null> {
  const key = secretKey();
  if (!key) return null;
  try {
    const res = await fetch(
      `${PAYSTACK_BASE}/bank/resolve?account_number=${encodeURIComponent(
        params.accountNumber
      )}&bank_code=${encodeURIComponent(params.bankCode)}`,
      { headers: { Authorization: `Bearer ${key}` } }
    );
    const body = await res.json();
    if (!res.ok || !body?.status || !body?.data?.account_name) {
      return null;
    }
    return { accountName: String(body.data.account_name) };
  } catch (err) {
    console.error("[paystack] resolve threw:", err);
    return null;
  }
}


