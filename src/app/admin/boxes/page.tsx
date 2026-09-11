import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Users } from 'lucide-react'
import { BackLink } from '@/components/back-link'
import { PendingDot } from '@/components/pending-dot'
import { SiteHeader } from '@/components/site-header'
import { Footer } from '@/components/footer'
import { Card, Empty, Pill } from '@/components/ui'
import { adminsConfigured, isAdmin, requireProfile } from '@/lib/session'
import { LEVELS } from '@/lib/game'
import { naira } from '@/lib/money'
import {
  BOX_SORTS,
  INSIGHTS_MIGRATION,
  boxActivity,
  boxSortFrom,
} from '@/lib/admin-insights'
import { AdminNotConfigured } from '../not-configured'
import { InsightProblem } from '../needs-migration'
import { Stat } from '../stat'

export const metadata = { title: 'Boxes' }
export const dynamic = 'force-dynamic'

/** How many boxes the list shows at once. */
const PAGE = 100

/**
 * Every box, arranged by how many people are actually playing it.
 *
 * The dashboard showed the newest eight and their attempt counts, which answers
 * "is anything happening" and nothing else. The question an admin has is which
 * box is working — and `attempts_count` cannot answer it, because it counts
 * goes rather than people. Two hundred goes from four players is four players
 * stuck on a box; forty goes from forty players is a box being shared, which is
 * the only thing that grows this site. Same column, opposite situations.
 *
 * So players and games are separate numbers here, and the list can be turned
 * round by either — including the quiet end, which is where a box that nobody
 * has found goes to sit.
 */
export default async function AdminBoxesPage({ searchParams }: PageProps<'/admin/boxes'>) {
  const [{ profile }, params] = await Promise.all([requireProfile(), searchParams])

  if (!adminsConfigured()) return <AdminNotConfigured email={profile.email} />
  if (!isAdmin(profile.email)) notFound()

  const sort = boxSortFrom(params.sort)
  const activity = await boxActivity(sort, PAGE)

  const rows = activity.ok ? activity.rows : []
  const played = rows.filter((box) => box.players > 0)
  const totalPlayers = rows.reduce((sum, box) => sum + box.players, 0)
  const chosen = BOX_SORTS.find((option) => option.key === sort)

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <BackLink href="/admin">Admin</BackLink>

        <div className="mt-4 flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Boxes</h1>
          <Pill tone="rose">Staff only</Pill>
        </div>
        <p className="mt-1.5 text-mist">
          Which ones people are actually playing, and which ones nobody found.
        </p>

        {activity.ok ? (
          <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="Boxes"
              value={rows.length.toLocaleString('en-NG')}
              tone="violet"
              hint={rows.length === PAGE ? `first ${PAGE}` : undefined}
            />
            <Stat
              label="Played at least once"
              value={played.length.toLocaleString('en-NG')}
              tone={played.length > 0 ? 'lime' : 'quiet'}
              hint={`${(rows.length - played.length).toLocaleString('en-NG')} never played`}
            />
            <Stat
              label="Players across them"
              value={totalPlayers.toLocaleString('en-NG')}
              tone="cyan"
              hint="counted once per box"
            />
          </section>
        ) : null}

        {/* ---------------------------- the ordering --------------------- */}
        <section className="mt-8">
          <p className="text-xs font-semibold tracking-wider text-dusk uppercase">Arrange by</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {BOX_SORTS.map((option) => {
              const on = option.key === sort

              return (
                <Link
                  key={option.key}
                  href={option.key === 'players' ? '/admin/boxes' : `?sort=${option.key}`}
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
          {chosen ? <p className="mt-2 text-xs text-dusk">{chosen.note}.</p> : null}
        </section>

        {/* ---------------------------- the list ------------------------- */}
        {!activity.ok ? (
          <div className="mt-6">
            <InsightProblem
              what="how many people have played each box"
              file={INSIGHTS_MIGRATION}
              needsMigration={activity.needsMigration}
              problem={activity.problem}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-6">
            <Empty title="No boxes yet">Nobody has made one.</Empty>
          </div>
        ) : (
          <Card className="mt-6 overflow-hidden !p-0">
            <ul className="divide-y divide-white/6">
              {rows.map((box) => (
                <li key={box.id}>
                  <Link
                    href={`/b/${box.code}`}
                    className="flex items-start gap-3 px-5 py-4 transition hover:bg-white/4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {box.title || 'Untitled box'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-dusk">
                        <span className="tabular font-mono">{box.code}</span> · by{' '}
                        {box.creator_name || 'unknown'} · {naira(box.prize_naira)}
                        <PendingDot />
                      </p>
                      <p className="mt-1.5 text-xs text-dusk">
                        best {box.best_level}/{LEVELS} ·{' '}
                        {box.lastPlayedAt ? `last played ${day(box.lastPlayedAt)}` : 'never played'}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="tabular flex items-center justify-end gap-1 text-base font-bold text-cyan">
                        <Users size={14} className="text-dusk" />
                        {box.players.toLocaleString('en-NG')}
                      </p>
                      <p className="text-xs text-dusk">
                        {box.players === 1 ? 'player' : 'players'}
                      </p>
                      <p className="tabular mt-1 text-xs text-mist">
                        {box.games.toLocaleString('en-NG')}{' '}
                        {box.games === 1 ? 'game' : 'games'}
                      </p>
                      <Pill tone={box.status === 'won' ? 'gold' : 'lime'} className="mt-1.5">
                        {box.status === 'won' ? 'Beaten' : 'Open'}
                      </Pill>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {activity.ok && rows.length === PAGE ? (
          <p className="mt-3 text-xs text-dusk">
            The first {PAGE} in this order. Change the order to see the other end of the list.
          </p>
        ) : null}
      </main>

      <Footer />
    </>
  )
}

function day(value: string): string {
  return new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}
