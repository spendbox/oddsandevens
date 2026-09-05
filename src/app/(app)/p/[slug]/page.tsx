import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Avatar } from '@/components/avatar'
import { Chip, EmptyState, SectionHeader, formatDate, timeAgo } from '@/components/ui'
import { accent } from '@/lib/accent'
import { suggestPeople, type Person } from '@/lib/matching'
import {
  asksByUser,
  myMembership,
  pursuitAsks,
  pursuitBySlug,
  pursuitEvents,
  pursuitMembers,
  pursuitPosts,
  pursuitProgress,
  pursuitResources,
  pursuitStages,
} from '@/lib/queries'
import { requireOnboardedProfile } from '@/lib/session'

export default async function PursuitHome(props: PageProps<'/p/[slug]'>) {
  const { slug } = await props.params
  const { profile, userId } = await requireOnboardedProfile()

  const pursuit = await pursuitBySlug(slug)
  if (!pursuit) notFound()

  const [membership, stages, progress, posts, asks, resources, events, members, askIndex] =
    await Promise.all([
      myMembership(pursuit.id, userId),
      pursuitStages(pursuit.id),
      pursuitProgress(pursuit.id),
      pursuitPosts(pursuit.id),
      pursuitAsks(pursuit.id),
      pursuitResources(pursuit.id),
      pursuitEvents(pursuit.id),
      pursuitMembers(pursuit.id),
      asksByUser(pursuit.id),
    ])

  const tone = accent(pursuit.accent)

  let matches: ReturnType<typeof suggestPeople> = []
  if (membership) {
    const viewer: Person = { profile, membership, asks: askIndex.get(userId) ?? [] }
    const candidates: Person[] = members
      .filter((row) => row.profile && row.user_id !== userId)
      .map((row) => ({
        profile: row.profile,
        membership: row,
        asks: askIndex.get(row.user_id) ?? [],
      }))
    matches = suggestPeople(viewer, candidates, stages, 3)
  }

  const needs = asks.filter((ask) => ask.kind === 'need').slice(0, 3)
  const offers = asks.filter((ask) => ask.kind === 'offer').slice(0, 3)

  return (
    <div className="space-y-8">
      {!membership ? (
        <div className="card bg-mist p-5">
          <h2 className="text-sm font-semibold text-ink">You are looking in from outside</h2>
          <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-ink-muted">
            Join to place yourself on the progress board, post what you need, and let Commons
            introduce you to the people here who can actually help.
          </p>
        </div>
      ) : null}

      <section>
        <p className="prose-commons max-w-2xl">{pursuit.description}</p>
        {pursuit.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pursuit.tags.map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </div>
        ) : null}
      </section>

      {/* The progress board in miniature — where the pursuit's people stand. */}
      <section>
        <SectionHeader
          title="Where everyone is"
          hint="The stages of this pursuit, and how many people are standing at each"
          action={{ label: 'Open the board', href: `/p/${slug}/progress` }}
        />
        <div className="card divide-y divide-line">
          {progress.stages.map((stage) => {
            const share =
              pursuit.member_count > 0 ? (stage.people / pursuit.member_count) * 100 : 0
            const mine = membership?.stage_id === stage.stage_id
            return (
              <div key={stage.stage_id} className="flex items-center gap-4 px-4 py-3">
                <div className="w-32 shrink-0 sm:w-40">
                  <p
                    className={`truncate text-[13px] font-medium ${mine ? 'text-accent' : 'text-ink'}`}
                  >
                    {stage.stage_name}
                    {mine ? ' · you' : ''}
                  </p>
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full rounded-full ${tone.bar}`}
                    style={{ width: `${Math.max(share, stage.people > 0 ? 2 : 0)}%` }}
                  />
                </div>
                <p className="w-16 shrink-0 text-right text-[12px] text-ink-muted tabular-nums">
                  {stage.people.toLocaleString()}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {matches.length > 0 ? (
        <section>
          <SectionHeader
            title="People you should meet"
            hint="Chosen from what they and you have said you need and can do"
            action={{ label: 'View all', href: `/p/${slug}/people` }}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {matches.map((match) => (
              <Link
                key={match.profile.id}
                href={`/u/${match.profile.handle}`}
                className="card card-hover p-4"
              >
                <Avatar profile={match.profile} size="md" />
                <p className="mt-2.5 truncate text-sm font-semibold text-ink">
                  {match.profile.full_name}
                </p>
                <p className="truncate text-[12px] text-ink-muted">{match.profile.headline}</p>
                <p className="mt-2 text-[12px] leading-relaxed text-accent">{match.reason}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionHeader
            title="Latest from the discussion"
            action={{ label: 'View all', href: `/p/${slug}/discussions` }}
          />
          {posts.length > 0 ? (
            <ul className="space-y-2.5">
              {posts.slice(0, 3).map((post) => (
                <li key={post.id}>
                  <Link href={`/p/${slug}/discussions`} className="card card-hover block p-4">
                    <div className="flex items-center gap-2">
                      <Avatar profile={post.author} size="xs" />
                      <span className="truncate text-[12px] font-medium text-ink">
                        {post.author.full_name}
                      </span>
                      <span className="text-[11px] text-ink-faint">
                        · {timeAgo(post.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[13px] font-medium text-ink">
                      {post.title || post.body.slice(0, 90)}
                    </p>
                    <p className="mt-1.5 text-[11px] text-ink-faint">
                      {post.reply_count} {post.reply_count === 1 ? 'reply' : 'replies'}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="💬" title="Nothing posted yet" body="Be the first to share where you are." />
          )}
        </section>

        <section>
          <SectionHeader
            title="Needs and offers"
            hint="What people are asking for, and what they can give"
            action={{ label: 'View all', href: `/p/${slug}/help` }}
          />
          {needs.length + offers.length > 0 ? (
            <ul className="space-y-2.5">
              {[...needs, ...offers].slice(0, 4).map((ask) => (
                <li key={ask.id} className="card p-3.5">
                  <div className="flex items-start gap-2.5">
                    <Chip tone={ask.kind === 'need' ? 'warn' : 'lift'}>
                      {ask.kind === 'need' ? 'I need' : 'I can help'}
                    </Chip>
                    <p className="min-w-0 flex-1 text-[13px] leading-snug font-medium text-ink">
                      {ask.title}
                    </p>
                  </div>
                  <p className="mt-1.5 pl-1 text-[11px] text-ink-faint">
                    {ask.author.full_name} · {timeAgo(ask.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="🤝" title="No open requests" body="Ask for something, or offer what you know." />
          )}
        </section>

        <section>
          <SectionHeader
            title="Most useful resources"
            action={{ label: 'View all', href: `/p/${slug}/resources` }}
          />
          {resources.length > 0 ? (
            <ul className="space-y-2.5">
              {resources.slice(0, 3).map((resource) => (
                <li key={resource.id} className="card p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">{resource.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-muted">
                        {resource.description}
                      </p>
                    </div>
                    <span className="chip bg-mist text-ink-muted tabular-nums">
                      {resource.vote_count}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="📚" title="No resources yet" body="Share the thing that helped you most." />
          )}
        </section>

        <section>
          <SectionHeader
            title="Coming up"
            action={{ label: 'View all', href: `/p/${slug}/events` }}
          />
          {events.length > 0 ? (
            <ul className="space-y-2.5">
              {events.slice(0, 3).map((event) => (
                <li key={event.id} className="card p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">{event.title}</p>
                      <p className="mt-0.5 text-[12px] text-ink-muted">
                        {formatDate(event.starts_at)} · {event.location}
                      </p>
                    </div>
                    <span className="chip bg-mist text-ink-muted">
                      {event.rsvp_count} going
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="📅" title="Nothing scheduled" body="Start a challenge or call a meetup." />
          )}
        </section>
      </div>
    </div>
  )
}
