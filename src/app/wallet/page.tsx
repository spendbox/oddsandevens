import { SiteHeader } from '@/components/site-header'
import { Button, Card, Empty, Pill, Problem } from '@/components/ui'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { paymentsConfigured } from '@/lib/paystack'
import { MIN_TOPUP_COINS, NAIRA_PER_COIN, coinsToNaira, naira } from '@/lib/money'
import type { LedgerEntry } from '@/lib/types'
import { startTopup } from './actions'

export const metadata = { title: 'Wallet' }

/** The packs on offer. The first is the minimum; the rest are round numbers. */
const PACKS = [
  { coins: 5, label: 'Starter' },
  { coins: 10, label: 'Handful' },
  { coins: 25, label: 'Serious', popular: true },
  { coins: 50, label: 'All in' },
]

const PROBLEMS: Record<string, string> = {
  minimum: `The smallest top-up is ${MIN_TOPUP_COINS} coins.`,
  maximum: 'That is more coins than we sell in one go. Try 500 or fewer.',
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
          <p className="mt-1 text-mist">
            worth {naira(coinsToNaira(profile.coins))} · {profile.coins}{' '}
            {profile.coins === 1 ? 'game' : 'games'}
          </p>
        </Card>

        {credited && credited > 0 ? (
          <p className="mt-4 rounded-2xl border border-lime/25 bg-lime/10 px-4 py-3 text-sm text-lime">
            ✓ {credited} {credited === 1 ? 'coin' : 'coins'} added. Go and beat something.
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
            One coin is {naira(NAIRA_PER_COIN)} and buys one attempt at any box. Minimum{' '}
            {MIN_TOPUP_COINS} coins.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {PACKS.map((pack) => (
              <form key={pack.coins} action={startTopup}>
                <input type="hidden" name="coins" value={pack.coins} />
                <button
                  type="submit"
                  className="pane relative w-full rounded-3xl p-5 text-left transition
                             hover:border-gold/50 active:scale-[0.98]"
                >
                  {pack.popular ? (
                    <span className="absolute -top-2.5 right-4">
                      <Pill tone="gold">Popular</Pill>
                    </span>
                  ) : null}
                  <p className="text-xs font-semibold tracking-wider text-dusk uppercase">
                    {pack.label}
                  </p>
                  <p className="tabular mt-1.5 text-3xl font-bold">
                    {pack.coins}
                    <span className="ml-1.5 text-base font-medium text-mist">coins</span>
                  </p>
                  <p className="tabular mt-1 text-sm text-gold">
                    {naira(coinsToNaira(pack.coins))}
                  </p>
                </button>
              </form>
            ))}
          </div>

          <Card className="mt-4">
            <form action={startTopup} className="flex flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1">
                <span className="mb-1.5 block text-sm font-medium text-mist">
                  Or another amount
                </span>
                <input
                  type="number"
                  name="coins"
                  min={MIN_TOPUP_COINS}
                  max={500}
                  defaultValue={MIN_TOPUP_COINS}
                  inputMode="numeric"
                  className="h-12 w-full rounded-2xl border border-white/12 bg-black/30 px-4
                             text-base text-chalk focus:border-gold/60 focus:outline-none
                             focus:ring-2 focus:ring-gold/25"
                />
              </label>
              <Button type="submit" tone="ghost" size="md">
                Pay with Paystack
              </Button>
            </form>
          </Card>
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
                      {entry.coins > 0 ? '↓' : '🎮'}
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
    </>
  )
}
