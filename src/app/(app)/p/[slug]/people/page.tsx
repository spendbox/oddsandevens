import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Avatar } from '@/components/avatar'
import { Chip, EmptyState, SectionHeader } from '@/components/ui'
import { peopleYouCouldHelp, suggestPeople, type Match, type Person } from '@/lib/matching'
import {
  asksByUser,
  myMembership,
  pursuitBySlug,
  pursuitMembers,
  pursuitStages,
} from '@/lib/queries'
import { requireOnboardedProfile } from '@/lib/session'
import { ConnectButton } from '@/components/connect-button'
import { supabaseServer } from '@/lib/supabase/server'

export default async function People(props: PageProps<'/p/[slug]/people'>) {
  const { slug } = await props.params
  const { profile, userId } = await requireOnboardedProfile()

  const pursuit = await pursuitBySlug(slug)
  if (!pursuit) notFound()

  const [membership, stages, members, askIndex] = await Promise.all([
    myMembership(pursuit.id, userId),
    pursuitStages(pursuit.id),
    pursuitMembers(pursuit.id),
    asksByUser(pursuit.id),
  ])

  const supabase = await supabaseServer()
  const { data: connections } = await supabase
    .from('connections')
    .select('requester_id, addressee_id, status')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)

  const connectionState = new Map<string, string>()
  for (const row of connections ?? []) {
    const other = row.requester_id === userId ? row.addressee_id : row.requester_id
    connectionState.set(other, row.status)
  }

  const candidates: Person[] = members
    .filter((row) => row.profile && row.user_id !== userId)
    .map((row) => ({
      profile: row.profile,
      membership: row,
      asks: askIndex.get(row.user_id) ?? [],
    }))

  let shouldMeet: Match[] = []
  let couldHelp: Match[] = []

  if (membership) {
    const viewer: Person = { profile, membership, asks: askIndex.get(userId) ?? [] }
    shouldMeet = suggestPeople(viewer, candidates, stages, 6)
    couldHelp = peopleYouCouldHelp(viewer, candidates, stages, 4)
  }

  const suggestedIds = new Set([
    ...shouldMeet.map((match) => match.profile.id),
    ...couldHelp.map((match) => match.profile.id),
  ])
  const everyoneElse = candidates.filter((person) => !suggestedIds.has(person.profile.id))

  return (
    <div className="space-y-8">
      {!membership ? (
        <div className="card bg-mist p-4 text-[13px] text-ink-muted">
          Join this pursuit and Commons will work out which of these {members.length} people are
          worth your time, and tell you why.
        </div>
      ) : null}

      {shouldMeet.length > 0 ? (
        <section>
          <SectionHeader
            title="People you should meet"
            hint="Ranked by what each of you has said you need and can do — not by follower count"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {shouldMeet.map((match) => (
              <MatchCard
                key={match.profile.id}
                match={match}
                slug={slug}
                pursuitId={pursuit.id}
                state={connectionState.get(match.profile.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {couldHelp.length > 0 ? (
        <section>
          <SectionHeader
            title="People you could help"
            hint="They are where you were. This is the half of the network that gives rather than asks."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {couldHelp.map((match) => (
              <MatchCard
                key={match.profile.id}
                match={match}
                slug={slug}
                pursuitId={pursuit.id}
                state={connectionState.get(match.profile.id)}
                tone="lift"
              />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader
          title={`Everyone else pursuing this`}
          hint={`${everyoneElse.length.toLocaleString()} more ${everyoneElse.length === 1 ? 'person' : 'people'}`}
        />
        {everyoneElse.length > 0 ? (
          <ul className="card divide-y divide-line">
            {everyoneElse.slice(0, 40).map((person) => {
              const stage = stages.find((item) => item.id === person.membership.stage_id)
              return (
                <li key={person.profile.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar profile={person.profile} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/u/${person.profile.handle}`}
                      className="truncate text-[13px] font-semibold text-ink hover:text-accent"
                    >
                      {person.profile.full_name}
                    </Link>
                    <p className="truncate text-[12px] text-ink-muted">
                      {person.profile.headline}
                    </p>
                  </div>
                  {stage ? <Chip>{stage.name}</Chip> : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState
            icon="👥"
            title="Nobody else yet"
            body="You are early. Invite someone who wants the same thing."
          />
        )}
      </section>
    </div>
  )
}

function MatchCard({
  match,
  slug,
  pursuitId,
  state,
  tone = 'accent',
}: {
  match: Match
  slug: string
  pursuitId: string
  state?: string
  tone?: 'accent' | 'lift'
}) {
  return (
    <div className="card card-hover p-4">
      <div className="flex items-start gap-3">
        <Avatar profile={match.profile} size="md" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/u/${match.profile.handle}`}
            className="block truncate text-sm font-semibold text-ink hover:text-accent"
          >
            {match.profile.full_name}
          </Link>
          <p className="truncate text-[12px] text-ink-muted">{match.profile.headline}</p>
          {match.profile.location ? (
            <p className="mt-0.5 truncate text-[11px] text-ink-faint">{match.profile.location}</p>
          ) : null}
        </div>
      </div>

      <p
        className={`mt-3 text-[12px] leading-relaxed ${tone === 'lift' ? 'text-lift' : 'text-accent'}`}
      >
        {match.reason}
      </p>

      {match.signals.length > 1 ? (
        <ul className="mt-2 space-y-1">
          {match.signals.slice(1, 3).map((signal) => (
            <li key={signal} className="text-[11px] text-ink-muted">
              · {signal}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3.5">
        <ConnectButton
          profileId={match.profile.id}
          handle={match.profile.handle}
          pursuitId={pursuitId}
          reason={match.reason}
          slug={slug}
          state={state}
        />
      </div>
    </div>
  )
}
