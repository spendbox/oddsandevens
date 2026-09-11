import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Search, Trophy } from 'lucide-react'
import { BackLink } from '@/components/back-link'
import { PendingDot } from '@/components/pending-dot'
import { SiteHeader } from '@/components/site-header'
import { Footer } from '@/components/footer'
import { Card, Empty, Pill } from '@/components/ui'
import { adminsConfigured, isAdmin, requireProfile } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { coinWord, naira } from '@/lib/money'
import { INSIGHTS_MIGRATION, moneySnapshot, topSpenders } from '@/lib/admin-insights'
import type { Profile, Topup } from '@/lib/types'
import { AdminNotConfigured } from '../not-configured'
import { InsightProblem } from '../needs-migration'
import { Stat } from '../stat'

export const metadata = { title: 'Transactions' }
export const dynamic = 'force-dynamic'

/** How many payments are listed at once. Enough to scroll, not enough to hang. */
const PAGE = 100

/** How many spenders the table shows. */
const SPENDERS = 20

const FILTERS = [
  { key: 'all', label: 'Everything' },
  { key: 'success', label: 'Paid' },
  { key: 'pending', label: 'Waiting' },
  { key: 'failed', label: 'Failed' },
] as const

type Filter = (typeof FILTERS)[number]['key']

/**
 * Every coin purchase, and who is making them.
 *
 * The dashboard had one number for money — what had come in — and no way to get
 * behind it. That is enough to know the site is earning and not enough to do
 * anything about it: you cannot tell whether ten people are buying coins or one
 * person is buying them ten times, you cannot find the payment somebody is
 * emailing you about, and a transfer that never landed looks exactly like a
 * transfer nobody started.
 *
 * So: the totals, the people, and then the payments themselves, searchable by
 * the reference the player has in front of them.
 */
export default async function AdminTransactionsPage({
  searchParams,
}: PageProps<'/admin/transactions'>) {
  const [{ profile }, params] = await Promise.all([requireProfile(), searchParams])

  if (!adminsConfigured()) return <AdminNotConfigured email={profile.email} />
  if (!isAdmin(profile.email)) notFound()

  const filter: Filter =
    FILTERS.find((option) => option.key === params.status)?.key ?? 'all'
  const query = typeof params.q === 'string' ? params.q.trim() : ''

  const admin = supabaseAdmin()

  const [snapshot, spenders] = await Promise.all([moneySnapshot(), topSpenders(SPENDERS)])

  // Searching by email means finding the people first. A payment row has no
  // address on it — only a user id and the reference Paystack gave it — so the
  // two things an admin has to hand, an email and a reference, are looked up
  // separately and then asked for together.
  let matchedIds: string[] = []
  if (query) {
    const { data } = await admin
      .from('profiles')
      .select('id')
      .or(`email.ilike.%${safe(query)}%,display_name.ilike.%${safe(query)}%`)
      .limit(50)
    matchedIds = ((data ?? []) as Pick<Profile, 'id'>[]).map((person) => person.id)
  }

  let payments = admin
    .from('topups')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(PAGE)

  if (filter !== 'all') payments = payments.eq('status', filter)

  if (query) {
    const clauses = [`reference.ilike.%${safe(query)}%`]
    if (matchedIds.length > 0) clauses.push(`user_id.in.(${matchedIds.join(',')})`)
    payments = payments.or(clauses.join(','))
  }

  const { data: rows } = await payments
  const list = (rows ?? []) as Topup[]

  // One lookup for the names on screen, not one per row.
  const { data: people } = await admin
    .from('profiles')
    .select('id, email, display_name')
    .in('id', list.length > 0 ? [...new Set(list.map((row) => row.user_id))] : ['none'])

  const byId = new Map(
    ((people ?? []) as Pick<Profile, 'id' | 'email' | 'display_name'>[]).map((person) => [
      person.id,
      person,
    ]),
  )

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <BackLink href="/admin">Admin</BackLink>

        <div className="mt-4 flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <Pill tone="rose">Staff only</Pill>
        </div>
        <p className="mt-1.5 text-mist">
          Every coin purchase, and the people making them.
        </p>

        {/* ---------------------------- the totals ----------------------- */}
        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Taken in"
            value={naira(snapshot.nairaIn)}
            tone="lime"
            hint={`${snapshot.payments.toLocaleString('en-NG')} payments`}
          />
          <Stat
            label="Coins sold"
            value={snapshot.coinsSold.toLocaleString('en-NG')}
            tone="cyan"
            hint={
              snapshot.exact
                ? `${snapshot.coinsGiven.toLocaleString('en-NG')} more were given free`
                : undefined
            }
          />
          <Stat
            label="Waiting"
            value={naira(snapshot.nairaPending)}
            tone={snapshot.paymentsPending > 0 ? 'gold' : 'quiet'}
            hint={`${snapshot.paymentsPending.toLocaleString('en-NG')} transfers not landed`}
          />
          <Stat
            label="Players who paid"
            value={snapshot.payingPlayers.toLocaleString('en-NG')}
            tone="violet"
            hint={`of ${snapshot.players.toLocaleString('en-NG')} accounts`}
          />
        </section>

        {snapshot.exact ? (
          <Card className="mt-3">
            <p className="text-xs font-semibold tracking-wider text-dusk uppercase">
              Where the coins are
            </p>
            {/* Spelled out as a sum rather than left as four tiles, because the
                only useful thing about these numbers is that they agree. Coins
                given away are not coins sold, and the moment the free coin
                existed "sold minus spent" stopped equalling what is in wallets —
                a dashboard that no longer adds up reads as broken long before
                anybody works out why. */}
            <p className="tabular mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
              <Part value={snapshot.coinsSold} label="sold" tone="text-cyan" />
              <span className="text-dusk">+</span>
              <Part value={snapshot.coinsGiven} label="given free" tone="text-gold" />
              <span className="text-dusk">−</span>
              <Part value={snapshot.coinsSpent} label="spent" tone="text-violet-soft" />
              <span className="text-dusk">=</span>
              <Part value={snapshot.coinsHeld} label="in wallets" tone="text-lime" />
            </p>
            {snapshot.coinsSold + snapshot.coinsGiven - snapshot.coinsSpent !==
            snapshot.coinsHeld ? (
              <p className="mt-2 text-xs text-rose">
                Those do not balance. Every coin should reach a wallet through the ledger, so
                a gap means something moved a balance without writing a line — worth finding.
              </p>
            ) : (
              <p className="mt-2 text-xs text-dusk">
                {snapshot.welcomeClaims.toLocaleString('en-NG')}{' '}
                {snapshot.welcomeClaims === 1 ? 'player has' : 'players have'} had the free
                coin. It is money given away, never money taken in, so it is counted here and
                nowhere near what has come in.
              </p>
            )}
          </Card>
        ) : null}

        {snapshot.paymentsFailed > 0 ? (
          <p className="mt-3 text-sm text-dusk">
            {snapshot.paymentsFailed.toLocaleString('en-NG')} failed{' '}
            {snapshot.paymentsFailed === 1 ? 'payment' : 'payments'} worth{' '}
            {naira(snapshot.nairaFailed)} — money nobody was charged for.
          </p>
        ) : null}

        {!snapshot.exact ? (
          <div className="mt-3">
            <InsightProblem
              what="exact totals"
              file={INSIGHTS_MIGRATION}
              needsMigration
              problem=""
            />
          </div>
        ) : null}

        {/* ---------------------------- who is spending ------------------ */}
        <section className="mt-10">
          <div className="mb-1 flex items-center gap-2">
            <Trophy size={18} className="text-gold" />
            <h2 className="text-xl font-bold tracking-tight">Top spenders</h2>
          </div>
          <p className="mb-4 text-sm text-dusk">
            By money paid in. Coins bought against coins spent says who is playing and who is
            sitting on a wallet.
          </p>

          {!spenders.ok ? (
            <InsightProblem
              what="who is spending"
              file={INSIGHTS_MIGRATION}
              needsMigration={spenders.needsMigration}
              problem={spenders.problem}
            />
          ) : spenders.rows.length === 0 ? (
            <Empty title="Nobody has bought coins yet">
              The first top-up will show up here.
            </Empty>
          ) : (
            <Card className="overflow-hidden !p-0">
              <ul className="divide-y divide-white/6">
                {spenders.rows.map((spender, index) => (
                  <li key={spender.userId} className="flex items-start gap-3 px-5 py-4">
                    <span
                      className={`tabular mt-0.5 w-6 shrink-0 text-sm font-bold ${
                        index === 0 ? 'text-gold' : 'text-dusk'
                      }`}
                    >
                      {index + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {spender.displayName || 'No name'}
                      </p>
                      <p className="truncate text-xs text-mist">{spender.email}</p>
                      <p className="mt-1.5 text-xs text-dusk">
                        {coinWord(spender.coinsBought)} bought ·{' '}
                        {spender.coinsSpent.toLocaleString('en-NG')} spent ·{' '}
                        {spender.coinsLeft.toLocaleString('en-NG')} left
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="tabular text-base font-bold text-lime">
                        {naira(spender.nairaIn)}
                      </p>
                      <p className="text-xs text-dusk">
                        {spender.payments} {spender.payments === 1 ? 'payment' : 'payments'}
                      </p>
                      <p className="text-xs text-dusk">last {day(spender.lastPaidAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        {/* ---------------------------- the payments --------------------- */}
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-tight">Every payment</h2>

          <form className="mt-4">
            {filter !== 'all' ? <input type="hidden" name="status" value={filter} /> : null}
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-dusk"
              />
              <input
                name="q"
                defaultValue={query}
                placeholder="Search by email, name or reference"
                className="h-12 w-full rounded-2xl border border-white/12 bg-black/30 pr-4 pl-11
                           text-base text-chalk placeholder:text-dusk focus:border-violet/60
                           focus:outline-none focus:ring-2 focus:ring-violet/25"
              />
            </label>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {FILTERS.map((option) => {
              const search = new URLSearchParams()
              if (option.key !== 'all') search.set('status', option.key)
              if (query) search.set('q', query)
              const href = search.size > 0 ? `?${search}` : '/admin/transactions'
              const on = option.key === filter

              return (
                <Link
                  key={option.key}
                  href={href}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${
                    on
                      ? 'bg-violet/20 text-violet-soft ring-violet/40'
                      : 'bg-white/5 text-mist ring-white/10 hover:bg-white/8'
                  }`}
                >
                  {option.label}
                  <PendingDot />
                </Link>
              )
            })}
          </div>

          {list.length === 0 ? (
            <div className="mt-4">
              <Empty title="No payments here">
                {query
                  ? 'Nothing matches that email, name or reference.'
                  : filter === 'pending'
                    ? 'No transfer is outstanding.'
                    : 'Nobody has bought coins yet.'}
              </Empty>
            </div>
          ) : (
            <Card className="mt-4 overflow-hidden !p-0">
              <ul className="divide-y divide-white/6">
                {list.map((payment) => {
                  const person = byId.get(payment.user_id)

                  return (
                    <li key={payment.id} className="flex items-start gap-3 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {person?.display_name || 'Deleted player'}
                        </p>
                        <p className="truncate text-xs text-mist">{person?.email ?? '—'}</p>
                        <p className="tabular mt-1.5 truncate font-mono text-xs text-dusk">
                          {payment.reference}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="tabular text-sm font-bold">
                          {naira(payment.amount_kobo / 100)}
                        </p>
                        <p className="text-xs text-dusk">{coinWord(payment.coins)}</p>
                        <Pill tone={tone(payment.status)} className="mt-1.5">
                          {word(payment.status)}
                        </Pill>
                        <p className="mt-1.5 text-xs text-dusk">
                          {stamp(payment.paid_at ?? payment.created_at)}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}

          <p className="mt-3 text-xs text-dusk">
            {list.length === PAGE
              ? `The ${PAGE} most recent. Search to find an older one.`
              : `${list.length} shown.`}
          </p>

          <Link
            href="/admin/boxes"
            className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-cyan underline underline-offset-4"
          >
            What the coins are being spent on <ArrowRight size={14} />
            <PendingDot />
          </Link>
        </section>
      </main>

      <Footer />
    </>
  )
}

/** One term in the coin sum, so the four of them line up the same way. */
function Part({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className={`font-bold ${tone}`}>{value.toLocaleString('en-NG')}</span>{' '}
      <span className="text-dusk">{label}</span>
    </span>
  )
}

/**
 * A search term with the characters PostgREST reads as punctuation taken out.
 *
 * `or=(...)` is a comma-separated list inside brackets, so a comma or a bracket
 * typed into the search box is not a character to match — it is a second
 * condition, and one that will not parse. Stripping them narrows the search by
 * nothing anybody would type on purpose and stops the query breaking.
 */
function safe(term: string): string {
  return term.replace(/[(),*]/g, ' ').trim()
}

function tone(status: Topup['status']): 'lime' | 'gold' | 'rose' {
  if (status === 'success') return 'lime'
  return status === 'pending' ? 'gold' : 'rose'
}

function word(status: Topup['status']): string {
  if (status === 'success') return 'Paid'
  return status === 'pending' ? 'Waiting' : 'Failed'
}

function day(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

function stamp(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
