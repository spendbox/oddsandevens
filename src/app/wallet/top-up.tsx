'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Clock,
  Copy,
  CreditCard,
  Landmark,
  RefreshCw,
} from 'lucide-react'
import { Button, Card, Pill, Problem, Spinner } from '@/components/ui'
import { SubmitDot } from '@/components/pending-dot'
import {
  MAX_TOPUP_COINS,
  MIN_TOPUP_COINS,
  NAIRA_PER_COIN,
  coinsToNaira,
  naira,
} from '@/lib/money'
import { startTopup } from './actions'

/**
 * Buying coins, without leaving Spendbox.
 *
 * Paystack opens a bank account that belongs to this one payment and hands back
 * the number. It is shown here, on the page, with the amount and a clock; the
 * player transfers from their own banking app and comes back to find the coins
 * already in. Nothing is typed into this page, no card details go anywhere near
 * it, and there is no checkout page to fail to load on a bad connection.
 *
 * The browser decides nothing about the money. All it does is ask, every few
 * seconds, whether Paystack has seen the transfer yet — and the answer to that
 * question, and the coins that follow it, are the server's, through the same
 * function the webhook uses. If this tab is closed halfway the webhook still
 * finishes the job.
 */

/** The packs on offer. The first is the minimum; the rest are round numbers. */
const PACKS = [
  { coins: 5, label: 'Starter' },
  { coins: 10, label: 'Handful' },
  { coins: 25, label: 'Serious', popular: true },
  { coins: 50, label: 'All in' },
]

/** How often to ask whether the money has landed. */
const POLL_MS = 4_000

/**
 * How long to keep asking, whatever the account's own expiry says.
 *
 * A tab left open on a desk should not still be polling tomorrow morning. It is
 * safe to give up: the webhook is what actually credits a late payment, and it
 * does not care whether anybody is looking.
 */
const POLL_FOR_MS = 45 * 60_000

/**
 * Where an open transfer is remembered, so that reloading the page — or coming
 * back to a tab the phone quietly discarded while the banking app was open —
 * does not lose the account number somebody is halfway through paying into.
 *
 * Not a secret: it is an account to pay *into*, and Paystack made it. It is
 * still checked against the server on the way back in, which is what stops a
 * second person on a shared phone seeing it at all.
 */
const REMEMBERED = 'spendbox.transfer'

type Transfer = {
  reference: string
  accountName: string
  accountNumber: string
  bankName: string
  expiresAt: string | null
  coins: number
  naira: number
}

type Stage =
  | { kind: 'choose' }
  // Which amount is being opened, so the pack that was tapped is the one that
  // spins rather than the whole grid going grey.
  | { kind: 'opening'; coins: number }
  | { kind: 'waiting'; transfer: Transfer }
  | { kind: 'paid'; coins: number }

function remember(transfer: Transfer | null) {
  try {
    if (transfer) localStorage.setItem(REMEMBERED, JSON.stringify(transfer))
    else localStorage.removeItem(REMEMBERED)
  } catch {
    // Private mode, or storage switched off. The flow still works for as long
    // as the page stays open, which is the common case.
  }
}

function recall(): Transfer | null {
  try {
    const saved = localStorage.getItem(REMEMBERED)
    return saved ? (JSON.parse(saved) as Transfer) : null
  } catch {
    return null
  }
}

export function TopUp() {
  const router = useRouter()

  const [stage, setStage] = useState<Stage>({ kind: 'choose' })
  const [problem, setProblem] = useState<string | null>(null)
  const [cardInstead, setCardInstead] = useState(false)
  const [custom, setCustom] = useState(MIN_TOPUP_COINS)

  const tooFew = custom < MIN_TOPUP_COINS
  const tooMany = custom > MAX_TOPUP_COINS
  const customValid = !tooFew && !tooMany && Number.isFinite(custom)

  /** Open a transfer for this many coins. */
  const open = useCallback(async (coins: number) => {
    setProblem(null)
    setCardInstead(false)
    setStage({ kind: 'opening', coins })

    try {
      const response = await fetch('/api/pay/transfer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coins }),
      })
      const body = (await response.json()) as Partial<Transfer> & {
        problem?: string
        cardInstead?: boolean
      }

      if (!response.ok || !body.accountNumber) {
        setProblem(body.problem ?? 'We could not start that payment. Try again.')
        setCardInstead(Boolean(body.cardInstead))
        setStage({ kind: 'choose' })
        return
      }

      const transfer = body as Transfer
      remember(transfer)
      setStage({ kind: 'waiting', transfer })
    } catch {
      setProblem('We could not reach the payment service. Check your connection and try again.')
      setStage({ kind: 'choose' })
    }
  }, [])

  /** Give up on the open transfer and go back to the packs. */
  const abandon = useCallback(() => {
    remember(null)
    setProblem(null)
    setStage({ kind: 'choose' })
  }, [])

  // Pick an open transfer back up after a reload. The check against the server
  // is what decides whether it is really this person's, so a forgotten entry on
  // a shared phone shows nobody anything.
  useEffect(() => {
    const saved = recall()
    if (!saved) return

    let alive = true
    void (async () => {
      try {
        const response = await fetch('/api/pay/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reference: saved.reference }),
        })
        if (!alive) return

        if (!response.ok) {
          remember(null)
          return
        }

        const body = (await response.json()) as { state?: string; coins?: number }
        if (!alive) return

        if (body.state === 'paid') {
          remember(null)
          setStage({ kind: 'paid', coins: body.coins ?? saved.coins })
          router.refresh()
          return
        }
        if (body.state === 'waiting') setStage({ kind: 'waiting', transfer: saved })
        else remember(null)
      } catch {
        // Offline on the way back in. Leave the entry alone; the next load can
        // pick it up.
      }
    })()

    return () => {
      alive = false
    }
  }, [router])

  if (stage.kind === 'paid') {
    return (
      <Card className="animate-rise border-lime/30 bg-lime/8 text-center">
        <BadgeCheck size={40} className="mx-auto text-lime" />
        <h3 className="mt-3 text-2xl font-bold tracking-tight">
          {stage.coins} {stage.coins === 1 ? 'coin' : 'coins'} added
        </h3>
        <p className="mt-2 text-sm text-mist">
          They are in your wallet. Go and beat something.
        </p>
        <Button
          tone="ghost"
          size="lg"
          className="mt-5 w-full"
          onClick={() => setStage({ kind: 'choose' })}
        >
          Buy more coins
        </Button>
      </Card>
    )
  }

  if (stage.kind === 'waiting') {
    return (
      <Waiting
        transfer={stage.transfer}
        onPaid={(coins) => {
          remember(null)
          setStage({ kind: 'paid', coins })
          router.refresh()
        }}
        onProblem={(message) => {
          remember(null)
          setProblem(message)
          setStage({ kind: 'choose' })
        }}
        onAbandon={abandon}
      />
    )
  }

  const opening = stage.kind === 'opening' ? stage.coins : null
  const busy = opening !== null

  return (
    <div>
      {problem ? (
        <div className="mb-4">
          <Problem>{problem}</Problem>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {PACKS.map((pack) => (
          <button
            key={pack.coins}
            type="button"
            disabled={busy}
            onClick={() => void open(pack.coins)}
            aria-busy={opening === pack.coins || undefined}
            className={
              'pane relative w-full rounded-3xl p-5 text-left transition ' +
              'hover:border-gold/50 active:scale-[0.98] disabled:pointer-events-none ' +
              (opening === pack.coins
                ? 'border-gold/50 opacity-95'
                : busy
                  ? 'opacity-40'
                  : '')
            }
          >
            {pack.popular ? (
              <span className="absolute -top-2.5 right-4">
                <Pill tone="gold">Popular</Pill>
              </span>
            ) : null}
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-dusk uppercase">
              {pack.label}
              {opening === pack.coins ? <Spinner className="size-3.5 text-gold" /> : null}
            </p>
            <p className="tabular mt-1.5 text-3xl font-bold">
              {pack.coins}
              <span className="ml-1.5 text-base font-medium text-mist">coins</span>
            </p>
            <p className="tabular mt-1 text-sm text-gold">{naira(coinsToNaira(pack.coins))}</p>
          </button>
        ))}
      </div>

      <Card className="mt-4">
        <div className="grid gap-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-mist">Or another amount</span>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={MIN_TOPUP_COINS}
                max={MAX_TOPUP_COINS}
                value={Number.isFinite(custom) ? custom : ''}
                onChange={(event) => setCustom(Number.parseInt(event.target.value, 10))}
                inputMode="numeric"
                className="tabular h-12 w-28 rounded-2xl border border-white/12 bg-black/30 px-4
                           text-base text-chalk focus:border-gold/60 focus:outline-none
                           focus:ring-2 focus:ring-gold/25"
              />
              <span className="text-sm text-mist">
                {custom === 1 ? 'coin' : 'coins'} × {naira(NAIRA_PER_COIN)}
              </span>
            </div>
          </label>

          {/* The number that actually matters. */}
          <div className="flex items-baseline justify-between rounded-2xl bg-black/30 px-4 py-3">
            <span className="text-sm text-mist">You transfer</span>
            <span className="tabular text-2xl font-bold text-gold">
              {customValid ? naira(coinsToNaira(custom)) : '—'}
            </span>
          </div>

          {tooFew ? (
            <p className="text-sm text-rose">
              The smallest top-up is {MIN_TOPUP_COINS} coins (
              {naira(coinsToNaira(MIN_TOPUP_COINS))}).
            </p>
          ) : null}
          {tooMany ? (
            <p className="text-sm text-rose">
              That is more coins than we sell in one go. Try {MAX_TOPUP_COINS} or fewer.
            </p>
          ) : null}

          <Button
            tone="gold"
            size="lg"
            disabled={!customValid || busy}
            busy={opening === custom}
            onClick={() => void open(custom)}
          >
            <Landmark size={18} />
            {customValid ? `Pay ${naira(coinsToNaira(custom))} by transfer` : 'Pay by transfer'}
          </Button>
        </div>
      </Card>

      {busy ? (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-mist">
          <Spinner className="size-4" /> Opening an account for your transfer…
        </p>
      ) : null}

      {/* The card route is still here, one tap away. It is the fallback rather
          than the default because a transfer is what most people in Nigeria
          actually reach for, and it is the one that survives a bad connection. */}
      {cardInstead || !busy ? (
        <form action={startTopup} className="mt-4 text-center">
          <input type="hidden" name="coins" value={customValid ? custom : MIN_TOPUP_COINS} />
          <button
            type="submit"
            className="inline-flex items-center gap-2 text-sm text-dusk underline
                       underline-offset-4 hover:text-mist"
          >
            <CreditCard size={15} /> Pay with a card instead
            <SubmitDot />
          </button>
        </form>
      ) : null}
    </div>
  )
}

/**
 * The account to pay into, the clock, and the waiting.
 *
 * Its own component so that the polling and the countdown start when the
 * transfer does and stop when it is gone, rather than being conditions inside
 * effects on the screen above.
 */
function Waiting({
  transfer,
  onPaid,
  onProblem,
  onAbandon,
}: {
  transfer: Transfer
  onPaid: (coins: number) => void
  onProblem: (message: string) => void
  onAbandon: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [msLeft, setMsLeft] = useState<number | null>(null)
  const [checking, setChecking] = useState(false)

  const expiresAt = transfer.expiresAt ? new Date(transfer.expiresAt).getTime() : 0
  const expired = msLeft !== null && msLeft <= 0

  // Held as an absolute moment and read against the clock, never counted down
  // from a duration: a duration goes stale the instant the tab is backgrounded,
  // which on this screen is guaranteed — the whole point is that the player
  // leaves for their banking app and comes back.
  useEffect(() => {
    if (!expiresAt) return

    const tick = () => setMsLeft(Math.max(0, expiresAt - Date.now()))
    tick()

    const timer = setInterval(tick, 1_000)
    return () => clearInterval(timer)
  }, [expiresAt])

  const check = useCallback(
    async (manual: boolean) => {
      if (manual) setChecking(true)
      try {
        const response = await fetch('/api/pay/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reference: transfer.reference }),
        })
        if (!response.ok) return
        const body = (await response.json()) as {
          state?: string
          coins?: number
          problem?: string
        }

        if (body.state === 'paid') onPaid(body.coins ?? transfer.coins)
        else if (body.state === 'failed') {
          onProblem('That payment did not go through. Nothing has been taken.')
        } else if (body.state === 'problem') {
          onProblem(body.problem ?? 'Payment received, but the coins did not land. Contact support.')
        }
      } catch {
        // One failed poll is not news. The next one asks again, and the webhook
        // is behind all of this either way.
      } finally {
        if (manual) setChecking(false)
      }
    },
    [onPaid, onProblem, transfer.coins, transfer.reference],
  )

  // Ask every few seconds, and once more the moment the account expires — money
  // sent in the last few seconds still counts.
  const checkRef = useRef(check)
  useEffect(() => {
    checkRef.current = check
  })

  useEffect(() => {
    if (expired) return

    const until = Date.now() + POLL_FOR_MS
    const poll = setInterval(() => {
      if (Date.now() > until) {
        clearInterval(poll)
        return
      }
      void checkRef.current(false)
    }, POLL_MS)

    return () => clearInterval(poll)
  }, [expired])

  // One last look the moment the account expires: money sent in the final few
  // seconds is still money sent.
  useEffect(() => {
    if (expired) void checkRef.current(false)
  }, [expired])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(transfer.accountNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 2_000)
    } catch {
      // Clipboard refused — an insecure origin, or permission denied. The
      // number is on screen in a size that can be read out loud, which is what
      // it is that size for.
    }
  }

  const clock =
    msLeft === null
      ? null
      : `${Math.floor(msLeft / 60_000)}:${String(Math.floor((msLeft % 60_000) / 1000)).padStart(2, '0')}`

  return (
    <div className="animate-rise">
      <Card className="border-gold/25 bg-linear-to-br from-gold/10 to-violet/8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold tracking-[0.2em] text-gold uppercase">
            Transfer {naira(transfer.naira)}
          </p>
          {clock ? (
            <Pill tone={expired ? 'rose' : msLeft !== null && msLeft < 300_000 ? 'gold' : 'quiet'}>
              <Clock size={13} /> {expired ? 'Expired' : clock}
            </Pill>
          ) : null}
        </div>

        <p className="mt-4 text-xs font-semibold tracking-wider text-dusk uppercase">
          Account number
        </p>
        <div className="mt-1 flex items-center gap-3">
          {/* Sized to the screen rather than to a breakpoint, and never allowed
              to wrap. A NUBAN is ten digits and this is the thing somebody
              copies into their bank app or reads down the phone — split across
              two lines with one digit orphaned on the second, it is a number
              waiting to be typed wrong. */}
          <p className="tabular min-w-0 flex-1 text-[clamp(1.5rem,7.5vw,2.25rem)] leading-none font-bold whitespace-nowrap">
            {transfer.accountNumber}
          </p>
          <button
            type="button"
            onClick={() => void copy()}
            aria-label="Copy the account number"
            className="ml-auto grid size-11 shrink-0 place-items-center rounded-2xl bg-white/8
                       text-mist ring-1 ring-inset ring-white/12 transition
                       hover:bg-white/14 active:scale-[0.94]"
          >
            {copied ? <Check size={18} className="text-lime" /> : <Copy size={18} />}
          </button>
        </div>

        {/* Every value is somebody else's text of unknown length — a bank that
            merged into a longer name, an account name with the business in it —
            so the label holds its width and the value wraps under itself
            rather than the pair squeezing each other off the card. */}
        <dl className="mt-5 grid gap-2 border-t border-white/8 pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-dusk">Bank</dt>
            <dd className="min-w-0 text-right font-medium break-words">{transfer.bankName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-dusk">Account name</dt>
            <dd className="min-w-0 text-right font-medium break-words">
              {transfer.accountName}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-dusk">Amount</dt>
            <dd className="tabular min-w-0 text-right font-semibold text-gold">
              {naira(transfer.naira)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-dusk">You get</dt>
            <dd className="min-w-0 text-right font-medium">
              {transfer.coins} {transfer.coins === 1 ? 'coin' : 'coins'}
            </dd>
          </div>
        </dl>
      </Card>

      {expired ? (
        <Card className="mt-4 text-center">
          <p className="text-sm text-mist">
            That account has expired. If you sent the money anyway it will still be found and
            credited — otherwise start a new transfer.
          </p>
          <Button tone="gold" size="lg" className="mt-4 w-full" onClick={onAbandon}>
            <RefreshCw size={17} /> Start a new transfer
          </Button>
        </Card>
      ) : (
        <Card className="mt-4">
          <p className="flex items-center gap-2.5 text-sm font-medium">
            <Spinner className="text-gold" />
            Waiting for your transfer…
          </p>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            Open your bank app and send exactly {naira(transfer.naira)} to the account above.
            Your coins are added the moment the money lands — you do not have to come back and
            tell us. It is safe to close this page.
          </p>

          <Button
            tone="ghost"
            size="lg"
            className="mt-4 w-full"
            busy={checking}
            onClick={() => void check(true)}
          >
            {checking ? null : <RefreshCw size={17} />}
            {checking ? 'Checking…' : 'I have sent it — check now'}
          </Button>
        </Card>
      )}

      <button
        type="button"
        onClick={onAbandon}
        className="mx-auto mt-4 flex items-center gap-2 text-sm text-dusk underline
                   underline-offset-4 hover:text-mist"
      >
        <ArrowLeft size={15} /> Choose a different amount
      </button>
    </div>
  )
}
