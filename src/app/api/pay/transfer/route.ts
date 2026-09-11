import { optionalProfile } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { PaystackError, chargeByTransfer, paymentsConfigured } from '@/lib/paystack'
import {
  MAX_TOPUP_COINS,
  MIN_TOPUP_COINS,
  coinsToNaira,
  nairaToKobo,
} from '@/lib/money'

/**
 * Open a bank transfer for a top-up, and hand back the account to pay into.
 *
 * How long the account lives. Long enough to open a banking app, log in, find
 * the transfer screen and type an account number — which on a bad morning is
 * not two minutes — and short enough that a stale card on a forgotten tab is
 * not still showing an account that Paystack has since given to somebody else.
 */
const WINDOW_MINUTES = 30

/**
 * The row goes in as 'pending' before Paystack is asked for anything, so that
 * whatever arrives later — the webhook, this screen polling, or a support
 * request on Monday — there is something with that reference to match against.
 * Coins are added only once Paystack says the money is there; see lib/wallet.ts.
 */
export async function POST(request: Request) {
  const profile = await optionalProfile()
  if (!profile) return Response.json({ problem: 'Sign in first.' }, { status: 401 })

  if (!paymentsConfigured()) {
    return Response.json(
      { problem: 'Payments are not set up on this deployment yet.' },
      { status: 503 },
    )
  }

  const body = (await request.json().catch(() => null)) as { coins?: unknown } | null
  const asked = Number(body?.coins)
  const coins = Number.isFinite(asked) ? Math.floor(asked) : 0

  if (coins < MIN_TOPUP_COINS) {
    return Response.json(
      { problem: `The smallest top-up is ${MIN_TOPUP_COINS} coins.` },
      { status: 400 },
    )
  }
  if (coins > MAX_TOPUP_COINS) {
    return Response.json(
      { problem: `That is more coins than we sell in one go. Try ${MAX_TOPUP_COINS} or fewer.` },
      { status: 400 },
    )
  }

  const naira = coinsToNaira(coins)
  const amountKobo = nairaToKobo(naira)
  // Prefixed so it is obvious what it is when it turns up in Paystack's
  // dashboard next to everything else that account is doing.
  const reference = `sbx_${crypto.randomUUID().replace(/-/g, '')}`

  const admin = supabaseAdmin()
  const { error } = await admin.from('topups').insert({
    user_id: profile.id,
    coins,
    amount_kobo: amountKobo,
    reference,
  })

  if (error) {
    return Response.json({ problem: 'We could not start that payment. Try again.' }, { status: 500 })
  }

  try {
    const account = await chargeByTransfer({
      email: profile.email,
      amountKobo,
      reference,
      expiresAt: new Date(Date.now() + WINDOW_MINUTES * 60_000),
    })

    // The window goes back as a length as well as a moment. The screen holds
    // the deadline against its own clock, and a phone an hour out — which is
    // most of the reason a clock reads wrong at all — would take an absolute
    // time for an account that had already closed. Given the distance from now,
    // it anchors that to the moment it asked, the way a level does.
    return Response.json({
      ...account,
      coins,
      naira,
      expiresInMs: Math.max(0, new Date(account.expiresAt).getTime() - Date.now()),
    })
  } catch (error) {
    await admin.from('topups').update({ status: 'failed' }).eq('reference', reference)

    // Say what Paystack actually said. A transfer that cannot be opened is
    // usually a switch on their dashboard, and "something went wrong" sends the
    // operator looking in the wrong place.
    console.warn(
      `[spendbox] could not open a transfer for ${profile.email}: ` +
        (error instanceof Error ? error.message : String(error)),
    )

    return Response.json(
      {
        problem:
          error instanceof PaystackError
            ? error.message
            : 'Paystack would not open a transfer just now. Try a card instead.',
        cardInstead: true,
      },
      { status: 502 },
    )
  }
}
