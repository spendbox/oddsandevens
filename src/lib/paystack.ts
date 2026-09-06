import 'server-only'

/**
 * Paystack, for creators who charge for their tools.
 *
 * Two rules hold the money side together. A transaction is only ever marked
 * paid after Paystack itself has been asked — never on the strength of the
 * browser coming back from checkout. And when a creator has given their
 * subaccount code, the split happens at Paystack, so their earnings never sit
 * in a platform balance waiting to be paid out by hand.
 */

const BASE = 'https://api.paystack.co'

export class PaystackError extends Error {}

function secret(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key || !key.trim()) {
    throw new PaystackError(
      'Payments are not set up: PAYSTACK_SECRET_KEY is not set. Add it in Vercel under ' +
        'Settings → Environment Variables (Paystack → Settings → API Keys), then redeploy. ' +
        'Free tools work without it.',
    )
  }
  return key.trim()
}

export function paymentsConfigured() {
  return Boolean(process.env.PAYSTACK_SECRET_KEY?.trim())
}

async function paystack<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${secret()}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })

  const body = (await response.json().catch(() => null)) as
    | { status?: boolean; message?: string; data?: T }
    | null

  if (!response.ok || !body?.status) {
    throw new PaystackError(body?.message ?? `Paystack returned ${response.status}.`)
  }

  return body.data as T
}

export async function startCheckout(args: {
  email: string
  amountKobo: number
  reference: string
  callbackUrl: string
  subaccount: string | null
}): Promise<{ authorization_url: string; reference: string }> {
  return paystack('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: args.email,
      amount: args.amountKobo,
      reference: args.reference,
      callback_url: args.callbackUrl,
      // The creator is paid directly; Forge keeps only what Paystack leaves.
      ...(args.subaccount ? { subaccount: args.subaccount, bearer: 'subaccount' } : {}),
    }),
  })
}

export async function verifyPayment(reference: string): Promise<{
  status: string
  amount: number
  currency: string
}> {
  return paystack(`/transaction/verify/${encodeURIComponent(reference)}`)
}
