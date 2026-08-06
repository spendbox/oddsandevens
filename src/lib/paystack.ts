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

/**
 * What a player needs in order to pay by bank transfer.
 *
 * One-time account details, generated per transaction. Nothing here is a
 * secret and nothing here is a card, which is the whole reason this path can be
 * drawn in our own house style: the browser is being shown an account number to
 * copy, not asked for anything sensitive. Money lands, Paystack fires
 * `charge.success` at the webhook, and the order settles down exactly the same
 * road a card payment does.
 */
export interface TransferDetails {
  bankName: string;
  accountNumber: string;
  accountName: string;
  amountKobo: number;
  /** ISO, when the account stops accepting this payment. Null if unstated. */
  expiresAt: string | null;
}

/** How long a generated account stays live. Long enough to open a banking app. */
const TRANSFER_MINUTES = 30;

/**
 * Charge by bank transfer rather than initialising a hosted checkout.
 *
 * `/charge` instead of `/transaction/initialize` because the two are different
 * products, not two flags on one: initialize hands back a *page of Paystack's*
 * to send the player to, and charge hands back the details of a payment they
 * make themselves. Only the second can be rendered by us.
 *
 * They share the reference, and must: the order row, the webhook, the verify
 * route and `orderTableFor` all key off it. One order, one reference, whichever
 * way it gets paid — so a player who opens the card form, backs out and
 * transfers instead cannot end up with two of anything.
 *
 * Response fields are read defensively. Paystack has moved account details
 * between the top level of `data` and a nested object across versions of this
 * endpoint, and a checkout that breaks on a field rename is a checkout that
 * breaks silently.
 */
export async function chargeBankTransfer(params: {
  email: string;
  amountKobo: number;
  reference: string;
}): Promise<TransferDetails | null> {
  const key = secretKey();
  if (!key) return null;
  const expiresAt = new Date(Date.now() + TRANSFER_MINUTES * 60_000).toISOString();

  try {
    const res = await fetch(`${PAYSTACK_BASE}/charge`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: params.email,
        amount: String(params.amountKobo),
        reference: params.reference,
        bank_transfer: { account_expires_at: expiresAt },
      }),
    });
    const body = await res.json();
    if (!res.ok || !body?.status) {
      console.error("[paystack] transfer charge failed:", body);
      return null;
    }

    const data = body.data ?? {};
    const nested = data.account_details ?? data.account ?? {};
    const account = String(nested.account_number ?? data.account_number ?? "");
    const bank = String(
      nested.bank_name ?? nested.bank?.name ?? data.bank?.name ?? data.bank_name ?? ""
    );
    const name = String(
      nested.account_name ?? data.account_name ?? "Paystack Checkout"
    );

    if (!account || !bank) {
      console.error("[paystack] transfer charge returned no account:", body);
      return null;
    }

    return {
      bankName: bank,
      accountNumber: account,
      accountName: name,
      amountKobo: params.amountKobo,
      expiresAt:
        (nested.account_expires_at as string | undefined) ??
        (data.account_expires_at as string | undefined) ??
        expiresAt,
    };
  } catch (err) {
    console.error("[paystack] transfer charge threw:", err);
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


