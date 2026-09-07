import { notFound } from 'next/navigation'
import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { Card, Empty, Pill } from '@/components/ui'
import { adminsConfigured, isAdmin, requireProfile } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { LEVELS } from '@/lib/game'
import { NAIRA_PER_COIN, naira } from '@/lib/money'
import type { Box, Payout } from '@/lib/types'
import { AdminNotConfigured } from './not-configured'

export const metadata = { title: 'Admin' }
export const dynamic = 'force-dynamic'

/**
 * What is going on, on one screen.
 *
 * Written for the person who runs Spendbox and needs to answer three questions
 * quickly: is anybody playing, is any money coming in, and does anybody need
 * paying. Anything that does not answer one of those is not on this page.
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

  const admin = supabaseAdmin()

  // head: true with an exact count asks Postgres for the number and sends back
  // no rows at all, which is what a dashboard wants — the tallies here should
  // not get slower as the tables fill up.
  const [players, boxesOpen, boxesWon, attempts, topups, payouts, recentBoxes] =
    await Promise.all([
      admin.from('profiles').select('*', { count: 'exact', head: true }),
      admin.from('boxes').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      admin.from('boxes').select('*', { count: 'exact', head: true }).eq('status', 'won'),
      admin.from('attempts').select('*', { count: 'exact', head: true }),
      admin.from('topups').select('coins, status').eq('status', 'success'),
      admin.from('payouts').select('amount_naira, status'),
      admin
        .from('boxes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(8),
    ])

  const coinsSold = (topups.data ?? []).reduce((sum, row) => sum + (row.coins ?? 0), 0)
  const revenue = coinsSold * NAIRA_PER_COIN

  const allPayouts = (payouts.data ?? []) as Pick<Payout, 'amount_naira' | 'status'>[]
  const owed = allPayouts
    .filter((payout) => payout.status === 'pending')
    .reduce((sum, payout) => sum + payout.amount_naira, 0)
  const paid = allPayouts
    .filter((payout) => payout.status === 'paid')
    .reduce((sum, payout) => sum + payout.amount_naira, 0)

  const boxes = (recentBoxes.data ?? []) as Box[]

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-4xl px-4 py-8 pb-24">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <Pill tone="rose">Staff only</Pill>
        </div>
        <p className="mt-1.5 text-mist">Signed in as {profile.email}</p>

        {/* ---------------------------- the money ------------------------ */}
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold tracking-[0.2em] text-dusk uppercase">
            Money
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Coins sold" value={coinsSold.toLocaleString('en-NG')} tone="cyan" />
            <Stat label="Taken in" value={naira(revenue)} tone="lime" />
            <Stat
              label="Owed out"
              value={naira(owed)}
              tone={owed > 0 ? 'gold' : 'quiet'}
              href="/admin/payouts"
            />
          </div>

          {owed > revenue ? (
            <p className="mt-3 rounded-2xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose">
              More is owed out than has come in. Every box beaten pays out twice the prize,
              funded by coins — check that the difficulty is holding.
            </p>
          ) : null}

          {paid > 0 ? (
            <p className="mt-3 text-sm text-dusk">{naira(paid)} has already been paid out.</p>
          ) : null}
        </section>

        {/* ---------------------------- activity ------------------------- */}
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold tracking-[0.2em] text-dusk uppercase">
            Activity
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Players" value={String(players.count ?? 0)} tone="violet" />
            <Stat label="Boxes open" value={String(boxesOpen.count ?? 0)} tone="lime" />
            <Stat label="Boxes beaten" value={String(boxesWon.count ?? 0)} tone="gold" />
            <Stat label="Games played" value={String(attempts.count ?? 0)} tone="cyan" />
          </div>
        </section>

        {/* ---------------------------- boxes ---------------------------- */}
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">Newest boxes</h2>
            <Link
              href="/admin/payouts"
              className="text-sm font-medium text-cyan underline underline-offset-4"
            >
              Payout queue →
            </Link>
          </div>

          {boxes.length === 0 ? (
            <Empty title="No boxes yet">Nobody has made one.</Empty>
          ) : (
            <Card className="overflow-hidden !p-0">
              <ul className="divide-y divide-white/6">
                {boxes.map((box) => (
                  <li key={box.id}>
                    <Link
                      href={`/b/${box.code}`}
                      className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-white/4"
                    >
                      <span className="tabular w-20 shrink-0 font-mono text-sm text-dusk">
                        {box.code}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {box.title || 'Untitled box'}
                        </p>
                        <p className="text-xs text-dusk">
                          by {box.creator_name || 'unknown'} · {box.attempts_count} attempts ·
                          best {box.best_level}/{LEVELS}
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
    </>
  )
}

function Stat({
  label,
  value,
  tone,
  href,
}: {
  label: string
  value: string
  tone: 'violet' | 'cyan' | 'lime' | 'gold' | 'quiet'
  href?: string
}) {
  const tones = {
    violet: 'text-violet-soft',
    cyan: 'text-cyan',
    lime: 'text-lime',
    gold: 'text-gold',
    quiet: 'text-mist',
  }

  const body = (
    <Card className={href ? 'transition hover:border-violet/45' : undefined}>
      <p className="text-xs font-semibold tracking-wider text-dusk uppercase">{label}</p>
      <p className={`tabular mt-1.5 text-2xl font-bold ${tones[tone]}`}>{value}</p>
    </Card>
  )

  return href ? <Link href={href}>{body}</Link> : body
}
