import { notFound } from 'next/navigation'
import { Chip, EmptyState, SectionHeader, formatDate, formatTime } from '@/components/ui'
import { myMembership, pursuitBySlug, pursuitEvents } from '@/lib/queries'
import { requireOnboardedProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import type { CommonsEvent } from '@/lib/types'
import { EventComposer, RsvpButton } from './event-ui'

const KIND_LABEL: Record<string, string> = {
  meetup: 'Meetup',
  workshop: 'Workshop',
  challenge: 'Challenge',
  ama: 'AMA',
  session: 'Session',
}

const KIND_TONE: Record<string, 'accent' | 'lift' | 'warn' | 'sky' | 'rose'> = {
  meetup: 'accent',
  workshop: 'sky',
  challenge: 'lift',
  ama: 'warn',
  session: 'rose',
}

export default async function Events(props: PageProps<'/p/[slug]/events'>) {
  const { slug } = await props.params
  const { userId } = await requireOnboardedProfile()

  const pursuit = await pursuitBySlug(slug)
  if (!pursuit) notFound()

  const [membership, events] = await Promise.all([
    myMembership(pursuit.id, userId),
    pursuitEvents(pursuit.id),
  ])

  const supabase = await supabaseServer()
  const { data: rsvps } = events.length
    ? await supabase
        .from('event_rsvps')
        .select('event_id')
        .eq('user_id', userId)
        .in(
          'event_id',
          events.map((event) => event.id),
        )
    : { data: [] as never[] }

  const going = new Set((rsvps ?? []).map((row: { event_id: string }) => row.event_id))

  const challenges = events.filter((event) => event.kind === 'challenge')
  const rest = events.filter((event) => event.kind !== 'challenge')

  return (
    <div className="space-y-8">
      {membership ? <EventComposer slug={slug} pursuitId={pursuit.id} /> : null}

      {events.length === 0 ? (
        <EmptyState
          icon="📅"
          title="Nothing scheduled"
          body="A challenge with a deadline finishes more projects than a year of discussion. Start one."
        />
      ) : (
        <>
          {challenges.length > 0 ? (
            <section>
              <SectionHeader
                title="Challenges"
                hint="Something with a start, an end, and other people watching"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {challenges.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    slug={slug}
                    going={going.has(event.id)}
                    canRsvp={Boolean(membership)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {rest.length > 0 ? (
            <section>
              <SectionHeader title="Coming up" />
              <div className="grid gap-3 sm:grid-cols-2">
                {rest.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    slug={slug}
                    going={going.has(event.id)}
                    canRsvp={Boolean(membership)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}

function EventCard({
  event,
  slug,
  going,
  canRsvp,
}: {
  event: CommonsEvent
  slug: string
  going: boolean
  canRsvp: boolean
}) {
  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <Chip tone={KIND_TONE[event.kind] ?? 'accent'}>{KIND_LABEL[event.kind] ?? 'Event'}</Chip>
        <span className="text-[11px] text-ink-faint tabular-nums">
          {event.rsvp_count} {event.rsvp_count === 1 ? 'person' : 'people'}
        </span>
      </div>

      <h3 className="mt-2.5 text-[15px] leading-snug font-semibold tracking-[-0.01em] text-ink">
        {event.title}
      </h3>

      {event.description ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{event.description}</p>
      ) : null}

      <dl className="mt-3 space-y-1 text-[12px] text-ink-muted">
        <div className="flex gap-2">
          <dt className="text-ink-faint">When</dt>
          <dd className="text-ink-soft">
            {formatDate(event.starts_at)} · {formatTime(event.starts_at)}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-faint">Where</dt>
          <dd className="text-ink-soft">{event.location || 'Online'}</dd>
        </div>
      </dl>

      {canRsvp ? (
        <div className="mt-4">
          <RsvpButton slug={slug} eventId={event.id} going={going} kind={event.kind} />
        </div>
      ) : null}
    </div>
  )
}
