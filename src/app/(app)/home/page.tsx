import Link from 'next/link'
import { Avatar } from '@/components/avatar'
import { IntentionCard, PursuitCard } from '@/components/pursuit-card'
import { EmptyState, SectionHeader, formatDate, formatTime, timeAgo } from '@/components/ui'
import { accent } from '@/lib/accent'
import { suggestPeople, suggestPursuits, type Person } from '@/lib/matching'
import { myPursuits } from '@/lib/queries'
import { requireOnboardedProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import type { Ask, CommonsEvent, Membership, Profile, Pursuit, Stage } from '@/lib/types'

export const metadata = { title: 'Home' }

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default async function HomePage() {
  const { profile, userId } = await requireOnboardedProfile()
  const supabase = await supabaseServer()

  const memberships = await myPursuits(userId)
  const joinedIds = new Set(memberships.map((m) => m.pursuit_id))

  const [{ data: allPursuits }, { data: upcoming }] = await Promise.all([
    supabase.from('pursuits').select('*').order('member_count', { ascending: false }).limit(40),
    joinedIds.size
      ? supabase
          .from('events')
          .select('*, pursuit:pursuits(slug, emoji, accent)')
          .in('pursuit_id', [...joinedIds])
          .gte('starts_at', new Date().toISOString())
          .order('starts_at')
          .limit(4)
      : Promise.resolve({ data: [] as never[] }),
  ])

  const recommendedPursuits = suggestPursuits(profile, (allPursuits ?? []) as Pursuit[], joinedIds)

  // People worth meeting, drawn from the pursuit the person is furthest into.
  const anchor = [...memberships].sort((a, b) => b.progress - a.progress)[0]
  const people = anchor ? await peopleForPursuit(anchor, profile) : []

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-7">
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
          {greeting()}, {profile.full_name.split(' ')[0] || profile.handle} 👋
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {memberships.length > 0
            ? 'What intentional progress will you make today?'
            : 'Start by joining a pursuit — then the people find you.'}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-9">
          <section>
            <SectionHeader
              title="Your intentions"
              action={memberships.length > 0 ? { label: 'View all', href: '/pursuits' } : undefined}
            />
            {memberships.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {memberships.slice(0, 4).map((membership) => (
                  <IntentionCard
                    key={membership.id}
                    pursuit={membership.pursuit}
                    progress={membership.progress}
                    stage={membership.stage}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon="🎯"
                title="No pursuits yet"
                body="A pursuit is an outcome you are working towards, shared with everyone else working towards it."
              >
                <Link href="/discover" className="btn btn-primary">
                  Find your first pursuit
                </Link>
              </EmptyState>
            )}
          </section>

          {people.length > 0 ? (
            <section>
              <SectionHeader
                title="People you should meet"
                hint={`From ${anchor!.pursuit.title}`}
                action={{ label: 'View all', href: `/p/${anchor!.pursuit.slug}/people` }}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {people.slice(0, 4).map((match) => (
                  <Link
                    key={match.profile.id}
                    href={`/u/${match.profile.handle}`}
                    className="card card-hover flex items-start gap-3 p-4"
                  >
                    <Avatar profile={match.profile} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {match.profile.full_name}
                      </p>
                      <p className="truncate text-[12px] text-ink-muted">
                        {match.profile.headline}
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-accent">
                        {match.reason}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <SectionHeader
              title="Recommended for you"
              hint="Pursuits close to what you already do"
              action={{ label: 'Discover', href: '/discover' }}
            />
            {recommendedPursuits.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {recommendedPursuits.map(({ pursuit, reason }) => (
                  <PursuitCard key={pursuit.id} pursuit={pursuit} reason={reason} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon="🧭"
                title="You are in everything we have"
                body="Create a pursuit of your own and other people will find it."
              >
                <Link href="/pursuits/new" className="btn btn-primary">
                  Create a pursuit
                </Link>
              </EmptyState>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <div className="card p-4">
            <SectionHeader title="Upcoming" action={{ label: 'View all', href: '/pursuits' }} />
            {upcoming && upcoming.length > 0 ? (
              <ul className="space-y-3">
                {(upcoming as (CommonsEvent & { pursuit: { slug: string; emoji: string; accent: string } })[]).map(
                  (event) => (
                    <li key={event.id}>
                      <Link
                        href={`/p/${event.pursuit.slug}/events`}
                        className="flex items-start gap-3 rounded-[10px] p-1 transition-colors hover:bg-mist"
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-sm ${accent(event.pursuit.accent).soft}`}
                        >
                          {event.pursuit.emoji}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-ink">{event.title}</p>
                          <p className="text-[11px] text-ink-muted">
                            {formatDate(event.starts_at)} · {formatTime(event.starts_at)}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p className="py-3 text-[13px] text-ink-muted">
                Nothing scheduled. Events from your pursuits show up here.
              </p>
            )}
          </div>

          <RecentActivity userId={userId} joinedIds={[...joinedIds]} />
        </aside>
      </div>
    </div>
  )
}

/** Build the Person records the matcher needs for one pursuit. */
async function peopleForPursuit(
  membership: Membership & { pursuit: Pursuit; stage: Stage | null },
  profile: Profile,
) {
  const supabase = await supabaseServer()

  const [{ data: stages }, { data: members }, { data: asks }] = await Promise.all([
    supabase.from('stages').select('*').eq('pursuit_id', membership.pursuit_id).order('position'),
    supabase
      .from('memberships')
      .select('*, profile:profiles(*)')
      .eq('pursuit_id', membership.pursuit_id)
      .limit(200),
    supabase.from('asks').select('*').eq('pursuit_id', membership.pursuit_id).eq('status', 'open'),
  ])

  const asksByUser = new Map<string, Ask[]>()
  for (const ask of (asks ?? []) as Ask[]) {
    asksByUser.set(ask.user_id, [...(asksByUser.get(ask.user_id) ?? []), ask])
  }

  const viewer: Person = {
    profile,
    membership,
    asks: asksByUser.get(profile.id) ?? [],
  }

  const candidates: Person[] = ((members ?? []) as (Membership & { profile: Profile })[])
    .filter((row) => row.profile && row.user_id !== profile.id)
    .map((row) => ({
      profile: row.profile,
      membership: row,
      asks: asksByUser.get(row.user_id) ?? [],
    }))

  return suggestPeople(viewer, candidates, (stages ?? []) as Stage[], 4)
}

async function RecentActivity({ userId, joinedIds }: { userId: string; joinedIds: string[] }) {
  if (joinedIds.length === 0) return null

  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('progress_updates')
    .select('*, author:profiles(*), pursuit:pursuits(slug, title)')
    .in('pursuit_id', joinedIds)
    .neq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(4)

  const updates = (data ?? []) as (import('@/lib/types').ProgressUpdate & {
    author: Profile
    pursuit: { slug: string; title: string }
  })[]

  if (updates.length === 0) return null

  return (
    <div className="card p-4">
      <SectionHeader title="Moving forward" hint="People in your pursuits" />
      <ul className="space-y-3.5">
        {updates.map((update) => (
          <li key={update.id} className="flex items-start gap-2.5">
            <Avatar profile={update.author} size="xs" />
            <div className="min-w-0">
              <p className="text-[12px] leading-snug text-ink-soft">
                <span className="font-medium text-ink">{update.author.full_name}</span>{' '}
                {update.note || `moved to ${update.to_progress}%`}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-faint">
                {update.pursuit.title} · {timeAgo(update.created_at)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
