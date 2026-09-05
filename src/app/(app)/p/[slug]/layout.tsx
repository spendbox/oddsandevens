import Link from 'next/link'
import { notFound } from 'next/navigation'
import { accent } from '@/lib/accent'
import { myMembership, pursuitBySlug, pursuitProgress, pursuitStages } from '@/lib/queries'
import { requireOnboardedProfile } from '@/lib/session'
import { JoinButton } from './join-button'
import { PursuitTabs } from './tabs'

export async function generateMetadata(props: LayoutProps<'/p/[slug]'>) {
  const { slug } = await props.params
  const pursuit = await pursuitBySlug(slug)
  return { title: pursuit?.title ?? 'Pursuit' }
}

export default async function PursuitLayout(props: LayoutProps<'/p/[slug]'>) {
  const { slug } = await props.params
  const { userId } = await requireOnboardedProfile()

  const pursuit = await pursuitBySlug(slug)
  if (!pursuit) notFound()

  const [membership, stages, progress] = await Promise.all([
    myMembership(pursuit.id, userId),
    pursuitStages(pursuit.id),
    pursuitProgress(pursuit.id),
  ])

  const tone = accent(pursuit.accent)
  const myStage = stages.find((stage) => stage.id === membership?.stage_id)

  return (
    <div>
      <header className={`border-b border-line ${tone.soft}`}>
        <div className="mx-auto max-w-5xl px-4 pt-5 pb-0 sm:px-6">
          <Link
            href="/pursuits"
            className="mb-4 inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            All pursuits
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-white text-2xl shadow-sm">
                {pursuit.emoji}
              </span>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">
                  {pursuit.title}
                </h1>
                <p className="mt-0.5 text-[13px] text-ink-muted">
                  {pursuit.member_count.toLocaleString()} pursuing this
                </p>
              </div>
            </div>

            <JoinButton
              slug={pursuit.slug}
              pursuitId={pursuit.id}
              isMember={Boolean(membership)}
            />
          </div>

          {/* The two numbers that tell you where everyone is, and where you are. */}
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Stat label="Collective progress" value={`${progress.collective}%`}>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
                <div
                  className={`h-full rounded-full ${tone.bar}`}
                  style={{ width: `${progress.collective}%` }}
                />
              </div>
            </Stat>

            <Stat
              label="Your progress"
              value={membership ? `${membership.progress}%` : '—'}
            >
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
                <div
                  className={`h-full rounded-full ${tone.bar}`}
                  style={{ width: `${membership?.progress ?? 0}%` }}
                />
              </div>
            </Stat>

            <Stat label="Current stage" value={myStage?.name ?? (membership ? 'Not set' : 'Not joined')}>
              <p className="mt-2 line-clamp-1 text-[11px] text-ink-muted">
                {myStage?.description ?? 'Join to place yourself on the journey.'}
              </p>
            </Stat>
          </div>

          <PursuitTabs slug={pursuit.slug} />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{props.children}</div>
    </div>
  )
}

function Stat({
  label,
  value,
  children,
}: {
  label: string
  value: string
  children?: React.ReactNode
}) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-ink">{value}</p>
      {children}
    </div>
  )
}
