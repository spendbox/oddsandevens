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

export async function initializeTransaction(params: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  /**
   * The business's Paystack subaccount. When present, Paystack splits the
   * payment at settlement and the business's share never touches our balance.
   */
  subaccount?: string | null;
}): Promise<{ authorizationUrl: string } | null> {
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
        ...(params.subaccount ? { subaccount: params.subaccount } : {}),
      }),
    });
    const body = await res.json();
    if (!res.ok || !body?.status || !body?.data?.authorization_url) {
      console.error("[paystack] initialize failed:", body);
      return null;
    }
    return { authorizationUrl: body.data.authorization_url };
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
// A business's share of a life purchase has to reach its bank without anyone
// moving it by hand, so each business is registered with Paystack as a
// *subaccount* and every purchase is initialised against it. Paystack does the
// split at settlement.
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

/**
 * Creates or updates the business's subaccount.
 *
 * `percentageCharge` is the share the *subaccount* keeps — so it is the
 * business's percentage, not ours. Passing an existing code updates in place
 * rather than leaving orphaned subaccounts behind every time a business
 * changes bank.
 */
export async function upsertSubaccount(params: {
  existingCode?: string | null;
  businessName: string;
  bankCode: string;
  accountNumber: string;
  percentageCharge: number;
}): Promise<{ subaccountCode: string } | null> {
  const key = secretKey();
  if (!key) return null;
  const path = params.existingCode
    ? `${PAYSTACK_BASE}/subaccount/${encodeURIComponent(params.existingCode)}`
    : `${PAYSTACK_BASE}/subaccount`;
  try {
    const res = await fetch(path, {
      method: params.existingCode ? "PUT" : "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        business_name: params.businessName,
        settlement_bank: params.bankCode,
        account_number: params.accountNumber,
        percentage_charge: params.percentageCharge,
      }),
    });
    const body = await res.json();
    if (!res.ok || !body?.status || !body?.data?.subaccount_code) {
      console.error("[paystack] subaccount failed:", body);
      return null;
    }
    return { subaccountCode: String(body.data.subaccount_code) };
  } catch (err) {
    console.error("[paystack] subaccount threw:", err);
    return null;
  }
}
