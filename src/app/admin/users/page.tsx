import { BackLink } from '@/components/back-link'
import { notFound } from 'next/navigation'
import { Search } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { Footer } from '@/components/footer'
import { Empty, Pill } from '@/components/ui'
import { adminsConfigured, isAdmin, requireProfile } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { AdminNotConfigured } from '../not-configured'
import { UserRow, type PlayerRow } from './user-row'
import { BoxLimit } from './box-limit'
import type { Box, Payout, Profile } from '@/lib/types'

export const metadata = { title: 'Players' }
export const dynamic = 'force-dynamic'

export default async function AdminUsersPage({ searchParams }: PageProps<'/admin/users'>) {
  const [{ profile }, params] = await Promise.all([requireProfile(), searchParams])

  if (!adminsConfigured()) return <AdminNotConfigured email={profile.email} />
  if (!isAdmin(profile.email)) notFound()

  const query = typeof params.q === 'string' ? params.q.trim() : ''
  const admin = supabaseAdmin()

  let people = admin
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (query) people = people.or(`email.ilike.%${query}%,display_name.ilike.%${query}%`)

  const [
    { data: profiles },
    { data: boxes },
    { data: payouts },
    { data: topups },
    settingsRow,
    boxCount,
  ] = await Promise.all([
    people,
    admin.from('boxes').select('creator_id, status'),
    admin.from('payouts').select('user_id, amount_naira, status').eq('status', 'pending'),
    admin.from('topups').select('user_id, amount_kobo').eq('status', 'success'),
    admin.from('settings').select('max_boxes').maybeSingle(),
    admin.from('boxes').select('*', { count: 'exact', head: true }),
  ])

  // The limit is read, not assumed. A missing settings table or a missing row
  // both mean the cap migrations have not been applied — in which case there
  // is no cap running at all, and showing a confident "0" or a confident
  // "10,000" would both be inventions. Say which it is instead, and let the
  // card explain itself.
  const limitProblem = settingsRow.error
    ? settingsRow.error.message
    : settingsRow.data
      ? null
      : 'no settings row'

  // Tallied here rather than with a query per player: a hundred rows on screen
  // must not become three hundred round trips.
  const boxesBy = new Map<string, { total: number; open: number }>()
  for (const box of (boxes ?? []) as Pick<Box, 'creator_id' | 'status'>[]) {
    const tally = boxesBy.get(box.creator_id) ?? { total: 0, open: 0 }
    tally.total += 1
    if (box.status === 'open') tally.open += 1
    boxesBy.set(box.creator_id, tally)
  }

  // What each person has actually paid in. Deleting them erases these rows, so
  // an admin should see the number before they do it.
  const paidInBy = new Map<string, number>()
  for (const topup of (topups ?? []) as { user_id: string; amount_kobo: number }[]) {
    paidInBy.set(topup.user_id, (paidInBy.get(topup.user_id) ?? 0) + topup.amount_kobo / 100)
  }

  const owedBy = new Map<string, number>()
  for (const payout of (payouts ?? []) as Pick<Payout, 'user_id' | 'amount_naira'>[]) {
    owedBy.set(payout.user_id, (owedBy.get(payout.user_id) ?? 0) + payout.amount_naira)
  }

  const players: PlayerRow[] = ((profiles ?? []) as Profile[]).map((person) => ({
    id: person.id,
    email: person.email,
    displayName: person.display_name,
    coins: person.coins,
    boxes: boxesBy.get(person.id)?.total ?? 0,
    openBoxes: boxesBy.get(person.id)?.open ?? 0,
    owed: owedBy.get(person.id) ?? 0,
    paidIn: paidInBy.get(person.id) ?? 0,
    createdAt: person.created_at,
  }))

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <BackLink href="/admin">Admin</BackLink>

        <div className="mt-4 flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Players</h1>
          <Pill tone="rose">Staff only</Pill>
        </div>

        <section className="mt-8">
          <BoxLimit
            current={settingsRow.data?.max_boxes ?? null}
            used={boxCount.count ?? 0}
            unreadable={limitProblem}
          />
        </section>

        <form className="mt-8">
          <label className="relative block">
            <Search
              size={17}
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-dusk"
            />
            <input
              name="q"
              defaultValue={query}
              placeholder="Search by email or name"
              className="h-12 w-full rounded-2xl border border-white/12 bg-black/30 pr-4 pl-11
                         text-base text-chalk placeholder:text-dusk focus:border-violet/60
                         focus:outline-none focus:ring-2 focus:ring-violet/25"
            />
          </label>
        </form>

        <p className="mt-4 text-sm text-dusk">
          {players.length === 100 ? 'First 100' : players.length}{' '}
          {players.length === 1 ? 'player' : 'players'}
          {query ? ` matching “${query}”` : ''}
        </p>

        {players.length === 0 ? (
          <div className="mt-4">
            <Empty title="Nobody here">
              {query ? 'No player matches that search.' : 'No accounts yet.'}
            </Empty>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3">
            {players.map((player) => (
              <li key={player.id}>
                <UserRow player={player} />
              </li>
            ))}
          </ul>
        )}
      </main>

      <Footer />
    </>
  )
}
