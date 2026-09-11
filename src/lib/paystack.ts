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

/** One Nigerian bank, as Paystack lists it. */
export type Bank = { name: string; code: string; slug: string }

/**
 * The list of banks a player can pick from.
 *
 * Fetched rather than hard-coded because it changes — banks merge, fintechs
 * arrive, codes get reassigned — and a stale list means somebody cannot be
 * paid. Cached for a day: it does not change often enough to ask on every page
 * load, and it must not be a dependency of the account page rendering.
 */
export async function listBanks(): Promise<Bank[]> {
  const response = await fetch(`${BASE}/bank?currency=NGN&perPage=100`, {
    headers: { authorization: `Bearer ${secret()}` },
    next: { revalidate: 86_400 },
  })

  const body = (await response.json().catch(() => null)) as
    | { status?: boolean; data?: Bank[] }
    | null

  if (!response.ok || !body?.status || !Array.isArray(body.data)) {
    throw new PaystackError('Could not load the list of banks from Paystack.')
  }

  // Paystack returns duplicates for banks with several codes. Keep one of each
  // name, and sort so the picker reads alphabetically.
  const seen = new Set<string>()
  return body.data
    .filter((bank) => (seen.has(bank.name) ? false : seen.add(bank.name)))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Ask the bank who owns an account number.
 *
 * This is Paystack's name enquiry against NIBSS, and it is the difference
 * between a payout that arrives and one that vanishes into a mistyped digit.
 * The name it returns is what gets stored — never what the player typed, which
 * is how account details end up not matching the bank's records.
 */
export async function resolveAccount(args: {
  accountNumber: string
  bankCode: string
}): Promise<{ account_name: string; account_number: string }> {
  const query = new URLSearchParams({
    account_number: args.accountNumber,
    bank_code: args.bankCode,
  })

  return paystack(`/bank/resolve?${query.toString()}`)
}

/**
 * A temporary bank account to pay into, and how long it lives.
 *
 * This is Paystack's "pay with transfer": rather than sending somebody off to a
 * hosted checkout page, Paystack hands back an account number that belongs to
 * this one payment. The player opens their own banking app, transfers the
 * amount, and the money arriving is what tells us to credit the coins — the
 * same rule as everywhere else in this file, just with the transfer as the
 * trigger instead of a card.
 *
 * It is the right default here. Buying coins on a Nigerian phone is a transfer
 * far more often than it is a card, and a card page loaded over mobile data is
 * a page that can fail to load at all. The account details are text, and text
 * survives a bad connection.
 */
export type TransferAccount = {
  reference: string
  accountName: string
  accountNumber: string
  bankName: string
  /** ISO time. Always set, and decided here rather than taken on trust. */
  expiresAt: string
}

/** Shapes Paystack has used for this response. Read defensively. */
type ChargeResponse = {
  reference?: string
  status?: string
  account_name?: string
  account_number?: string
  bank?: { name?: string; slug?: string } | string
  bank_name?: string
  account_expires_at?: string
  expires_at?: string
  display_text?: string
}

/**
 * Never hand back a window with less than this left in it.
 *
 * `account_expires_at` has come back from this endpoint in more than one shape,
 * including without a timezone on it at all, so a value that lands in the past
 * or a couple of minutes from now is a timestamp we have read wrong far more
 * often than it is an account that really closes that soon. Read literally, it
 * puts an expired card in front of somebody who has not even opened their
 * banking app yet, and what the player sees is the payment timing out on them.
 */
const MIN_WINDOW_MS = 5 * 60_000

/** Paystack's timestamps, when they carry no offset at all, are Lagos time. */
const WAT = '+01:00'

/**
 * Paystack's idea of a time, as a moment.
 *
 * `2026-09-11T12:30:00.000Z` and `2026-09-11 12:30:00` have both come back from
 * here, and the second one handed to a browser means whatever that phone's
 * timezone happens to be — which is how a thirty minute window turns into an
 * expired one on a handset set to the wrong city, or an hour short on one set
 * to the right one. Anything without an offset is read as WAT, on the server,
 * once.
 */
function paystackTime(value: string | undefined): number | null {
  const text = value?.trim()
  if (!text) return null

  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
  const at = new Date(zoned ? text.replace(' ', 'T') : `${text.replace(' ', 'T')}${WAT}`).getTime()

  return Number.isFinite(at) ? at : null
}

/**
 * When the account really closes.
 *
 * We asked for a window and Paystack answered; this is the one place the two
 * are reconciled. Their answer wins when it is sane — the account is theirs,
 * and if they close it sooner the clock on screen should say so — but an answer
 * already in the past, or minutes from it, is refused in favour of the window
 * we asked for. The refusal is logged, because "every transfer on this business
 * expires the moment it opens" is something the operator needs to be told
 * rather than left to piece together out of support messages.
 */
function closesAt(theirs: string | undefined, asked: Date, reference: string): number {
  const ours = asked.getTime()
  const paystack = paystackTime(theirs)

  if (paystack === null) return ours

  if (paystack < Date.now() + MIN_WINDOW_MS) {
    console.warn(
      `[spendbox] Paystack says the account for ${reference} expires at ${theirs}, which is ` +
        'too soon to be true. Showing the window we asked for instead.',
    )
    return ours
  }

  return Math.min(paystack, ours)
}

export async function chargeByTransfer(args: {
  email: string
  amountKobo: number
  reference: string
  expiresAt: Date
}): Promise<TransferAccount> {
  const data = await paystack<ChargeResponse>('/charge', {
    method: 'POST',
    body: JSON.stringify({
      email: args.email,
      amount: args.amountKobo,
      reference: args.reference,
      bank_transfer: { account_expires_at: args.expiresAt.toISOString() },
    }),
  })

  const bank =
    typeof data.bank === 'string' ? data.bank : (data.bank?.name ?? data.bank_name ?? '')

  if (!data.account_number) {
    // Paystack answered, but not with an account. Almost always means "Pay with
    // Transfer" is not switched on for this business — a dashboard setting, not
    // a code problem — so say that rather than showing an empty card.
    throw new PaystackError(
      data.display_text ??
        'Paystack did not return an account to pay into. Check that "Pay with Transfer" is ' +
          'enabled on your Paystack dashboard under Settings → Preferences.',
    )
  }

  return {
    reference: data.reference ?? args.reference,
    accountName: data.account_name ?? 'Paystack',
    accountNumber: data.account_number,
    bankName: bank || 'Bank',
    expiresAt: new Date(
      closesAt(data.account_expires_at ?? data.expires_at, args.expiresAt, args.reference),
    ).toISOString(),
  }
}

/**
 * Has the transfer landed yet?
 *
 * `/charge/:reference` rather than `/transaction/verify`, and the difference
 * matters: verify calls a payment nobody has made yet "abandoned", which is a
 * verdict, and acting on it would fail a payment the player is still in the
 * middle of making. This endpoint says `pending` and means it.
 *
 * `timeout` and `abandoned` are not failures and must never be read as any.
 * They are Paystack saying the charge *attempt* gave up waiting — the session,
 * not the account — and they turn up minutes into a transfer somebody is still
 * in the middle of making, long before the account they are paying into closes.
 * This was read as a failure once, and it told a player who was queuing at
 * their bank app that the payment had not gone through while the account was
 * still sitting there open, waiting for exactly that money.
 *
 * Only a verdict about the money itself counts: `failed` and `reversed`.
 * Everything else is "not yet".
 */
export type ChargeState = 'pending' | 'success' | 'failed'

export async function chargeStatus(reference: string): Promise<ChargeState> {
  const data = await paystack<{ status?: string }>(
    `/charge/${encodeURIComponent(reference)}`,
  )

  if (data.status === 'success') return 'success'
  if (data.status === 'failed' || data.status === 'reversed') return 'failed'
  return 'pending'
}
