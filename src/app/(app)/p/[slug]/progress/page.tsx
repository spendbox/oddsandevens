import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Avatar } from '@/components/avatar'
import { Chip, EmptyState, SectionHeader, timeAgo } from '@/components/ui'
import { accent } from '@/lib/accent'
import { peopleYouCouldHelp, type Person } from '@/lib/matching'
import {
  asksByUser,
  myCompletions,
  myMembership,
  pursuitBySlug,
  pursuitMembers,
  pursuitProgress,
  pursuitProgressFeed,
  pursuitStages,
} from '@/lib/queries'
import { requireOnboardedProfile } from '@/lib/session'
import { CompleteStage } from './complete-stage'

export default async function Progress(props: PageProps<'/p/[slug]/progress'>) {
  const { slug } = await props.params
  const { profile, userId } = await requireOnboardedProfile()

  const pursuit = await pursuitBySlug(slug)
  if (!pursuit) notFound()

  const [membership, stages, progress, feed, members, askIndex, completions] = await Promise.all([
    myMembership(pursuit.id, userId),
    pursuitStages(pursuit.id),
    pursuitProgress(pursuit.id),
    pursuitProgressFeed(pursuit.id),
    pursuitMembers(pursuit.id),
    asksByUser(pursuit.id),
    myMembership(pursuit.id, userId).then(() => myCompletions(pursuit.id, userId)),
  ])

  const tone = accent(pursuit.accent)
  const done = new Set(completions.map((completion) => completion.stage_id))

  // Where everyone stands. A member is "at" the first stage they have not
  // finished, which is exactly what their membership row already says.
  const byStage = new Map<string, typeof members>()
  for (const member of members) {
    if (!member.stage_id) continue
    byStage.set(member.stage_id, [...(byStage.get(member.stage_id) ?? []), member])
  }

  const currentStage = stages.find((stage) => stage.id === membership?.stage_id) ?? null
  const finishedAll = membership !== null && done.size === stages.length && stages.length > 0

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
      {membership && currentStage && !finishedAll ? (
        <CompleteStage
          slug={slug}
          pursuitId={pursuit.id}
          stage={currentStage}
          position={done.size + 1}
          total={stages.length}
        />
      ) : null}

      {finishedAll ? (
        <div className="card bg-lift-soft p-5">
          <p className="text-sm font-semibold text-lift">🏁 You finished every stage of this pursuit</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
            Everything you wrote on the way through is still here, and the people behind you are
            reading it. The most useful thing you can do now is answer them.
          </p>
        </div>
      ) : null}

      <section>
        <SectionHeader
          title="The journey"
          hint={`${progress.collective}% collective progress across ${pursuit.member_count.toLocaleString()} ${
            pursuit.member_count === 1 ? 'person' : 'people'
          }`}
        />

        <ol className="space-y-2.5">
          {stages.map((stage) => {
            const people = byStage.get(stage.id) ?? []
            const finished = done.has(stage.id)
            const current = membership?.stage_id === stage.id && !finishedAll
            const counted = progress.stages.find((row) => row.stage_id === stage.id)

            return (
              <li
                key={stage.id}
                className={`card p-4 ${current ? 'border-accent-line bg-accent-soft/40' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                        finished
                          ? 'bg-lift text-white'
                          : current
                            ? `${tone.bar} text-white`
                            : 'bg-mist text-ink-faint'
                      }`}
                    >
                      {finished ? '✓' : stage.position}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[13px] font-semibold tracking-wide text-ink uppercase">
                        {stage.name}
                        {current ? (
                          <span className="ml-2 text-accent lowercase">· you are here</span>
                        ) : finished ? (
                          <span className="ml-2 text-lift lowercase">· done</span>
                        ) : null}
                      </h3>
                      <p className="mt-0.5 text-[12px] text-ink-muted">{stage.description}</p>
                    </div>
                  </div>
                  <p className="shrink-0 text-right text-[12px] text-ink-muted tabular-nums">
                    {(counted?.people ?? 0).toLocaleString()}
                    <span className="ml-1 text-[11px]">here</span>
                  </p>
                </div>

                {people.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-9">
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
                      <span className="text-[11px] text-ink-faint">+{people.length - 12} more</span>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
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
                  <p className="truncate text-sm font-semibold text-ink">{match.profile.full_name}</p>
                  <p className="truncate text-[12px] text-ink-muted">{match.profile.headline}</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-lift">{match.reason}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader
          title="Recently finished a stage"
          hint="What people did, in their own words"
        />
        {feed.length > 0 ? (
          <ul className="space-y-3">
            {feed.map((completion) => (
              <li key={completion.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <Avatar profile={completion.author} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={`/u/${completion.author.handle}`}
                        className="text-[13px] font-semibold text-ink hover:text-accent"
                      >
                        {completion.author.full_name}
                      </Link>
                      <span className="text-[11px] text-ink-faint">
                        finished {completion.stage?.name} · {timeAgo(completion.completed_at)}
                      </span>
                    </div>
                    <div className="prose-commons mt-2 text-[13px]">{completion.what_i_did}</div>
                    {completion.what_was_hard ? (
                      <div className="mt-2.5 rounded-[10px] bg-mist p-3">
                        <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">
                          What was hard
                        </p>
                        <div className="prose-commons mt-1 text-[13px]">
                          {completion.what_was_hard}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-2.5">
                      <Link
                        href={`/p/${slug}/discussions?kind=reflection`}
                        className="text-[12px] font-medium text-accent hover:text-accent-hover"
                      >
                        Reply to this in the discussion →
                      </Link>
                    </div>
                  </div>
                  <Chip tone="lift">🪜 {completion.stage?.name}</Chip>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="🪜"
            title="Nobody has finished a stage yet"
            body="When someone does, they write down what they actually did — and everyone still on that stage gets told."
          />
        )}
      </section>
    </div>
  )
}
