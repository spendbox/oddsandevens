import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Paystack, for filling a wallet with coins.
 *
 * One rule holds the money side together: coins are only ever credited after
 * Paystack itself has said the money arrived — either because we asked it
 * (verify) or because it told us (the webhook, whose signature we check). The
 * browser coming back from checkout is a hint that it is worth asking, and
 * nothing more than that.
 */

const BASE = 'https://api.paystack.co'

export class PaystackError extends Error {}

function secret(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key || !key.trim()) {
    throw new PaystackError(
      'Payments are not set up: PAYSTACK_SECRET_KEY is not set. Add it in Vercel under ' +
        'Settings → Environment Variables (Paystack → Settings → API Keys), then redeploy.',
    )
  }
  return key.trim()
}

export function paymentsConfigured(): boolean {
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
}): Promise<{ authorization_url: string; reference: string }> {
  return paystack('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: args.email,
      amount: args.amountKobo,
      reference: args.reference,
      callback_url: args.callbackUrl,
    }),
  })
}

export async function verifyPayment(reference: string): Promise<{
  status: string
  amount: number
  currency: string
  reference: string
}> {
  return paystack(`/transaction/verify/${encodeURIComponent(reference)}`)
}

/**
 * Is this webhook really from Paystack?
 *
 * Paystack signs the raw body with the secret key. Anyone can POST to the
 * webhook URL, so an unsigned or wrongly signed request is somebody trying to
 * credit themselves coins for free. Compared in constant time so that the
 * comparison itself does not leak the answer one byte at a time.
 */
export function webhookIsGenuine(rawBody: string, signature: string | null): boolean {
  if (!signature) return false

  const expected = createHmac('sha512', secret()).update(rawBody).digest('hex')
  const given = Buffer.from(signature, 'utf8')
  const mine = Buffer.from(expected, 'utf8')

  if (given.length !== mine.length) return false
  return timingSafeEqual(given, mine)
}
