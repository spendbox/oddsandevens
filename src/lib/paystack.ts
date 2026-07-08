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
