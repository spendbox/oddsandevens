import Link from 'next/link'
import { EmptyState, ProgressBar, SectionHeader } from '@/components/ui'
import { accent, categoryLabel } from '@/lib/accent'
import { myPursuits } from '@/lib/queries'
import { requireOnboardedProfile } from '@/lib/session'

export const metadata = { title: 'Your pursuits' }

export default async function Pursuits() {
  const { userId } = await requireOnboardedProfile()
  const memberships = await myPursuits(userId)

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
            Your pursuits
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {memberships.length > 0
              ? `${memberships.length} ${memberships.length === 1 ? 'outcome' : 'outcomes'} you are working towards`
              : 'Nothing yet'}
          </p>
        </div>
        <Link href="/pursuits/new" className="btn btn-primary shrink-0">
          Create
        </Link>
      </div>

      {memberships.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="You are not pursuing anything yet"
          body="Find an outcome you want and join the people already working towards it."
        >
          <Link href="/discover" className="btn btn-primary">
            Discover pursuits
          </Link>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {memberships.map((membership) => {
            const tone = accent(membership.pursuit.accent)
            return (
              <li key={membership.id}>
                <Link href={`/p/${membership.pursuit.slug}`} className="card card-hover block p-4">
                  <div className="flex items-start gap-3.5">
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] text-xl ${tone.soft}`}
                    >
                      {membership.pursuit.emoji}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                          {membership.pursuit.title}
                        </h2>
                        <span className={`chip ${tone.chip}`}>
                          {categoryLabel(membership.pursuit.category)}
                        </span>
                      </div>

                      {membership.intent ? (
                        <p className="mt-1 line-clamp-1 text-[13px] text-ink-muted">
                          &ldquo;{membership.intent}&rdquo;
                        </p>
                      ) : (
                        <p className="mt-1 line-clamp-1 text-[13px] text-ink-muted">
                          {membership.pursuit.tagline}
                        </p>
                      )}

                      <div className="mt-3 flex items-center gap-3">
                        <ProgressBar value={membership.progress} />
                        <span className="shrink-0 text-[11px] font-medium text-ink-muted tabular-nums">
                          {membership.progress}%
                        </span>
                      </div>

                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
                        <span>{membership.stage?.name ?? 'No stage set'}</span>
                        <span>·</span>
                        <span>
                          {membership.pursuit.member_count.toLocaleString()} pursuing this
                        </span>
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <section className="mt-10">
        <SectionHeader title="Something missing?" />
        <div className="card p-5">
          <p className="text-sm leading-relaxed text-ink-soft">
            A pursuit only needs one person to start. Name the outcome, lay out the stages people
            pass through on the way to it, and Commons will bring you the people who want the same
            thing.
          </p>
          <Link href="/pursuits/new" className="btn btn-primary mt-4">
            Create a pursuit
          </Link>
        </div>
      </section>
    </div>
  )
}
