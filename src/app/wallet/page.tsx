import { SiteHeader } from '@/components/site-header'
import { Footer } from '@/components/footer'
import { Card, Empty, Problem } from '@/components/ui'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { ArrowDownLeft, Gamepad2 } from 'lucide-react'
import { paymentsConfigured } from '@/lib/paystack'
import {
  CHEAPEST_RETRY,
  COINS_PER_PLAY,
  MAX_TOPUP_COINS,
  MIN_TOPUP_COINS,
  NAIRA_PER_COIN,
  coinWord,
  coinsToNaira,
  naira,
} from '@/lib/money'
import type { LedgerEntry } from '@/lib/types'
import { TopUp } from './top-up'

export const metadata = { title: 'Wallet' }

const PROBLEMS: Record<string, string> = {
  minimum: `The smallest top-up is ${MIN_TOPUP_COINS} coins.`,
  maximum: `That is more coins than we sell in one go. Try ${MAX_TOPUP_COINS} or fewer.`,
  start: 'We could not start that payment. Try again.',
  paystack: 'Paystack would not open a checkout just now. Try again in a moment.',
  setup: 'Payments are not set up on this deployment yet.',
  verify: 'We could not confirm that payment. If money left your account, contact support.',
}

export default async function WalletPage({ searchParams }: PageProps<'/wallet'>) {
  const { profile } = await requireProfile()
  const supabase = await supabaseServer()
  const params = await searchParams

  const { data } = await supabase
    .from('coin_ledger')
    .select('*')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(25)

  const history = (data ?? []) as LedgerEntry[]
  const problem = typeof params.problem === 'string' ? PROBLEMS[params.problem] : null
  const credited = typeof params.credited === 'string' ? Number(params.credited) : null

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-2xl px-4 py-8 pb-24">
        {/* ------------------------------- the balance ------------------- */}
        <Card className="bg-linear-to-br from-gold/15 to-violet/10 text-center">
          <p className="text-sm font-semibold tracking-[0.2em] text-gold uppercase">
            Your wallet
          </p>
          <p className="tabular mt-2 text-6xl font-bold">
            {profile.coins}
            <span className="ml-2 text-2xl text-mist">
              {profile.coins === 1 ? 'coin' : 'coins'}
            </span>
          </p>
          {/* Coins count goes first, because that is what somebody looking at
              this screen is about to spend them on. Carrying on from a missed
              level is the other thing they buy, and it is quoted at its
              cheapest — at level 8 the same coins buy fewer. */}
          <p className="mt-1 text-mist">
            worth {naira(coinsToNaira(profile.coins))} ·{' '}
            {profile.coins >= COINS_PER_PLAY
              ? `${Math.floor(profile.coins / COINS_PER_PLAY)} ${
                  Math.floor(profile.coins / COINS_PER_PLAY) === 1 ? 'go' : 'goes'
                } at a box`
              : `a go is ${coinWord(COINS_PER_PLAY)}`}
          </p>
        </Card>

        {credited && credited > 0 ? (
          <p className="mt-4 rounded-2xl border border-lime/25 bg-lime/10 px-4 py-3 text-sm text-lime">
            {credited} {credited === 1 ? 'coin' : 'coins'} added. Go and beat something.
          </p>
        ) : null}

        {problem ? (
          <div className="mt-4">
            <Problem>{problem}</Problem>
          </div>
        ) : null}

        {!paymentsConfigured() ? (
          <div className="mt-4">
            <Problem>
              Payments are switched off: PAYSTACK_SECRET_KEY is not set on this deployment.
            </Problem>
          </div>
        ) : null}

        {/* ------------------------------- buying ------------------------ */}
        <section className="mt-8">
          <h2 className="text-xl font-bold tracking-tight">Add coins</h2>
          <p className="mt-1.5 text-sm text-mist">
            A go at a box is {coinWord(COINS_PER_PLAY)}. Carrying on from a level that beat
            you, instead of starting over, is from {coinWord(CHEAPEST_RETRY)} — more the
            further up you are. One coin is {naira(NAIRA_PER_COIN)}, minimum {MIN_TOPUP_COINS}.
            Pay by transfer from your bank app — the account to send to appears right here, and
            your coins land by themselves.
          </p>

          <div className="mt-5">
            <TopUp />
          </div>
        </section>

        {/* ------------------------------- history ----------------------- */}
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-bold tracking-tight">Coin history</h2>

          {history.length === 0 ? (
            <Empty title="Nothing here yet">
              Every coin in and every coin out will show up here.
            </Empty>
          ) : (
            <Card className="overflow-hidden !p-0">
              <ul className="divide-y divide-white/6">
                {history.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-white/6 text-sm"
                      aria-hidden
                    >
                      {entry.coins > 0 ? <ArrowDownLeft size={16} /> : <Gamepad2 size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {entry.memo || (entry.coins > 0 ? 'Coins added' : 'Played a box')}
                      </p>
                      <p className="text-xs text-dusk">
                        {new Date(entry.created_at).toLocaleString('en-NG', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <span
                      className={
                        'tabular shrink-0 text-sm font-semibold ' +
                        (entry.coins > 0 ? 'text-lime' : 'text-mist')
                      }
                    >
                      {entry.coins > 0 ? '+' : ''}
                      {entry.coins}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </main>

      <Footer />
    </>
  )
}
