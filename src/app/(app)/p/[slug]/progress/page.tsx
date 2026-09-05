import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Avatar } from '@/components/avatar'
import { EmptyState, SectionHeader, timeAgo } from '@/components/ui'
import { accent } from '@/lib/accent'
import { peopleYouCouldHelp, type Person } from '@/lib/matching'
import {
  asksByUser,
  myMembership,
  pursuitBySlug,
  pursuitMembers,
  pursuitProgress,
  pursuitProgressFeed,
  pursuitStages,
} from '@/lib/queries'
import { requireOnboardedProfile } from '@/lib/session'
import { ProgressForm } from './progress-form'

export default async function Progress(props: PageProps<'/p/[slug]/progress'>) {
  const { slug } = await props.params
  const { profile, userId } = await requireOnboardedProfile()

  const pursuit = await pursuitBySlug(slug)
  if (!pursuit) notFound()

  const [membership, stages, progress, feed, members, askIndex] = await Promise.all([
    myMembership(pursuit.id, userId),
    pursuitStages(pursuit.id),
    pursuitProgress(pursuit.id),
    pursuitProgressFeed(pursuit.id),
    pursuitMembers(pursuit.id),
    asksByUser(pursuit.id),
  ])

  const tone = accent(pursuit.accent)
  const total = members.length || 1

  // People at each stage, so you can see who is standing where.
  const byStage = new Map<string, typeof members>()
  for (const member of members) {
    if (!member.stage_id) continue
    byStage.set(member.stage_id, [...(byStage.get(member.stage_id) ?? []), member])
  }

  let couldHelp: ReturnType<typeof peopleYouCouldHelp> = []
  if (membership) {
    const viewer: Person = { profile, membership, asks: askIndex.get(userId) ?? [] }
    const candidates: Person[] = members
      .filter((row) => row.profile && row.user_id !== userId)
      .map((row) => ({
        profile: row.profile,
        membership: row,
        asks: askIndex.get(row.user_id) ?? [],
      }))
    couldHelp = peopleYouCouldHelp(viewer, candidates, stages, 4)
  }

  return (
    <div className="space-y-8">
      {membership ? (
        <ProgressForm
          slug={slug}
          pursuitId={pursuit.id}
          stages={stages}
          currentStageId={membership.stage_id}
          currentProgress={membership.progress}
        />
      ) : null}

      <section>
        <SectionHeader
          title="The journey"
          hint={`${progress.collective}% collective progress across ${pursuit.member_count.toLocaleString()} people`}
        />

        <div className="space-y-2.5">
          {progress.stages.map((stage) => {
            const people = byStage.get(stage.stage_id) ?? []
            const share = (stage.people / total) * 100
            const mine = membership?.stage_id === stage.stage_id

            return (
              <div
                key={stage.stage_id}
                className={`card p-4 ${mine ? 'border-accent-line bg-accent-soft/40' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-[13px] font-semibold tracking-wide text-ink uppercase">
                    {stage.stage_name}
                    {mine ? <span className="ml-2 text-accent lowercase">· you are here</span> : null}
                  </h3>
                  <p className="shrink-0 text-[13px] font-medium text-ink tabular-nums">
                    {stage.people.toLocaleString()}
                    <span className="ml-1 text-[11px] font-normal text-ink-muted">
                      {stage.people === 1 ? 'person' : 'people'}
                    </span>
                  </p>
                </div>

                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full rounded-full ${tone.bar}`}
                    style={{ width: `${Math.max(share, stage.people > 0 ? 2 : 0)}%` }}
                  />
                </div>

                {people.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {people.slice(0, 12).map((member) => (
                      <Link
                        key={member.id}
                        href={`/u/${member.profile.handle}`}
                        title={member.profile.full_name}
                      >
                        <Avatar profile={member.profile} size="xs" />
                      </Link>
                    ))}
                    {people.length > 12 ? (
                      <span className="text-[11px] text-ink-faint">
                        +{people.length - 12} more
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      {couldHelp.length > 0 ? (
        <section>
          <SectionHeader
            title="People you could help"
            hint="They are standing where you were standing. You have already solved this part."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {couldHelp.map((match) => (
              <Link
                key={match.profile.id}
                href={`/u/${match.profile.handle}`}
                className="card card-hover flex items-start gap-3 p-4"
              >
                <Avatar profile={match.profile} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {match.profile.full_name}
                  </p>
                  <p className="truncate text-[12px] text-ink-muted">{match.profile.headline}</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-lift">{match.reason}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader title="Recently moved forward" />
        {feed.length > 0 ? (
          <ul className="card divide-y divide-line">
            {feed.map((update) => (
              <li key={update.id} className="flex items-start gap-3 px-4 py-3.5">
                <Avatar profile={update.author} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink-soft">
                    <Link
                      href={`/u/${update.author.handle}`}
                      className="font-semibold text-ink hover:text-accent"
                    >
                      {update.author.full_name}
                    </Link>{' '}
                    {update.note || `moved to ${update.to_progress}%`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">
                    {update.from_progress !== null
                      ? `${update.from_progress}% → ${update.to_progress}%`
                      : `${update.to_progress}%`}{' '}
                    · {timeAgo(update.created_at)}
                  </p>
                </div>
                {update.is_milestone ? <span className="chip bg-lift-soft text-lift">Milestone</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="📈"
            title="No movement recorded yet"
            body="When someone moves forward it shows here, and the people behind them get told."
          />
        )}
      </section>
    </div>
  )
}
