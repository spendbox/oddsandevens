import { PendingDot } from '@/components/pending-dot'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Trophy, Users } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { Footer } from '@/components/footer'
import { Card, Empty, Pill } from '@/components/ui'
import { adminsConfigured, isAdmin, requireProfile } from '@/lib/session'
import { LEVELS } from '@/lib/game'
import { naira } from '@/lib/money'
import { livePrize } from '@/lib/settings'
import {
  INSIGHTS_MIGRATION,
  boxActivity,
  moneySnapshot,
  topSpenders,
} from '@/lib/admin-insights'
import { AdminNotConfigured } from './not-configured'
import { InsightProblem } from './needs-migration'
import { Stat } from './stat'

export const metadata = { title: 'Admin' }
export const dynamic = 'force-dynamic'

/** How many of each list the dashboard previews before handing over to its page. */
const PREVIEW = 5

/**
 * What is going on, on one screen.
 *
 * Written for the person who runs Spendbox and needs to answer four questions
 * quickly: is anybody playing, is any money coming in, who is spending it, and
 * does anybody need paying. Anything that does not answer one of those is not
 * on this page — and each of the four has a page of its own behind it, because
 * a number with nothing behind it is a number you cannot act on.
 */
export default async function AdminPage() {
  const { profile } = await requireProfile()

  // Nobody is on the list at all. That is a deployment that forgot a variable,
  // not somebody snooping, and answering with a 404 sends whoever runs this
  // site hunting for a broken route. Say what is actually wrong instead.
  if (!adminsConfigured()) return <AdminNotConfigured email={profile.email} />

  // The list exists and they are not on it. Now a 404 is the right answer:
  // somebody who is not an admin should not learn this page exists.
  if (!isAdmin(profile.email)) notFound()

  const [snapshot, spenders, busiest, prize] = await Promise.all([
    // Every total on this page, counted by Postgres over the whole table rather
    // than by this page over the first page of rows it was handed. See
    // src/lib/admin-insights.ts — the old way stopped being right at the
    // thousandth payment and did not say so.
    moneySnapshot(),
    topSpenders(PREVIEW),
    boxActivity('players', PREVIEW),
    // What a box made right now is worth. It is on this page because it is the
    // number every other number here is a consequence of, and because the one
    // place it can be changed is not somewhere anybody would think to look for
    // it — the card that edits it sits on the Players screen, next to the box
    // limit, and this is what points at it.
    livePrize(),
  ])

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-4xl px-4 py-8 pb-24">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <Pill tone="rose">Staff only</Pill>
        </div>
        <p className="mt-1.5 text-mist">Signed in as {profile.email}</p>

        <nav className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Jump href="/admin/transactions">Transactions</Jump>
          <Jump href="/admin/boxes">Boxes</Jump>
          <Jump href="/admin/users">Players</Jump>
          <Jump href="/admin/payouts">Payouts</Jump>
          <Jump href="/admin/email">Email</Jump>
        </nav>

        {/* ---------------------------- the money ------------------------ */}
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold tracking-[0.2em] text-dusk uppercase">
            Money
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Taken in"
              value={naira(snapshot.nairaIn)}
              tone="lime"
              href="/admin/transactions"
              hint={`${snapshot.coinsSold.toLocaleString('en-NG')} coins sold`}
            />
            <Stat
              label="Waiting"
              value={naira(snapshot.nairaPending)}
              tone={snapshot.paymentsPending > 0 ? 'gold' : 'quiet'}
              href="/admin/transactions"
              hint={`${snapshot.paymentsPending.toLocaleString('en-NG')} transfers not landed`}
            />
            <Stat
              label="Owed out"
              value={naira(snapshot.nairaOwed)}
              tone={snapshot.nairaOwed > 0 ? 'gold' : 'quiet'}
              href="/admin/payouts"
            />
            <Stat
              label="Prize on a new box"
              value={naira(prize)}
              tone="violet"
              href="/admin/users"
            />
          </div>

          {snapshot.nairaOwed > snapshot.nairaIn ? (
            <p className="mt-3 rounded-2xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose">
              More is owed out than has come in. Every box beaten pays out twice the prize,
              funded by coins — check that the difficulty is holding.
            </p>
          ) : null}

          {snapshot.nairaPaid > 0 ? (
            <p className="mt-3 text-sm text-dusk">
              {naira(snapshot.nairaPaid)} has already been paid out.
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
        </section>

        {/* ---------------------------- activity ------------------------- */}
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold tracking-[0.2em] text-dusk uppercase">
            Activity
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Players"
              value={snapshot.players.toLocaleString('en-NG')}
              tone="violet"
              href="/admin/users"
              hint={
                snapshot.exact
                  ? `${snapshot.playersWhoPlayed.toLocaleString('en-NG')} have played`
                  : undefined
              }
            />
            <Stat
              label="Boxes open"
              value={snapshot.boxesOpen.toLocaleString('en-NG')}
              tone="lime"
              href="/admin/boxes"
            />
            <Stat
              label="Boxes beaten"
              value={snapshot.boxesWon.toLocaleString('en-NG')}
              tone="gold"
              href="/admin/boxes"
            />
            <Stat
              label="Games played"
              value={snapshot.games.toLocaleString('en-NG')}
              tone="cyan"
              href="/admin/boxes"
            />
          </div>
        </section>

        {/* ---------------------------- who is spending ------------------ */}
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <Trophy size={18} className="text-gold" /> Top spenders
            </h2>
            <Jump href="/admin/transactions">All transactions</Jump>
          </div>

          {!spenders.ok ? (
            <InsightProblem
              what="who is spending"
              file={INSIGHTS_MIGRATION}
              needsMigration={spenders.needsMigration}
              problem={spenders.problem}
            />
          ) : spenders.rows.length === 0 ? (
            <Empty title="No coins bought yet">The first top-up will show up here.</Empty>
          ) : (
            <Card className="overflow-hidden !p-0">
              <ul className="divide-y divide-white/6">
                {spenders.rows.map((spender, index) => (
                  <li key={spender.userId} className="flex items-center gap-3 px-5 py-3.5">
                    <span
                      className={`tabular w-5 shrink-0 text-sm font-bold ${
                        index === 0 ? 'text-gold' : 'text-dusk'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {spender.displayName || spender.email}
                      </p>
                      <p className="truncate text-xs text-dusk">
                        {spender.coinsBought.toLocaleString('en-NG')} coins ·{' '}
                        {spender.payments} {spender.payments === 1 ? 'payment' : 'payments'}
                      </p>
                    </div>
                    <span className="tabular shrink-0 text-sm font-bold text-lime">
                      {naira(spender.nairaIn)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        {/* ---------------------------- boxes ---------------------------- */}
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <Users size={18} className="text-cyan" /> Busiest boxes
            </h2>
            <Jump href="/admin/boxes">Every box</Jump>
          </div>

          {!busiest.ok ? (
            <InsightProblem
              what="how many people have played each box"
              file={INSIGHTS_MIGRATION}
              needsMigration={busiest.needsMigration}
              problem={busiest.problem}
            />
          ) : busiest.rows.length === 0 ? (
            <Empty title="No boxes yet">Nobody has made one.</Empty>
          ) : (
            <Card className="overflow-hidden !p-0">
              <ul className="divide-y divide-white/6">
                {busiest.rows.map((box) => (
                  <li key={box.id}>
                    <Link
                      href={`/b/${box.code}`}
                      className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-white/4"
                    >
                      <span className="tabular w-20 shrink-0 font-mono text-sm text-dusk">
                        {box.code}
                        <PendingDot />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {box.title || 'Untitled box'}
                        </p>
                        <p className="text-xs text-dusk">
                          by {box.creator_name || 'unknown'} · {box.players}{' '}
                          {box.players === 1 ? 'player' : 'players'} · {box.games}{' '}
                          {box.games === 1 ? 'game' : 'games'} · best {box.best_level}/{LEVELS}
                        </p>
                      </div>
                      <Pill tone={box.status === 'won' ? 'gold' : 'lime'}>
                        {box.status === 'won' ? 'Beaten' : 'Open'}
                      </Pill>
                    </Link>
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

/** A link to somewhere else in the admin, that says it has been tapped. */
function Jump({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1 text-sm font-medium text-cyan underline underline-offset-4"
    >
      {children} <ArrowRight size={14} /> <PendingDot />
    </Link>
  )
}
