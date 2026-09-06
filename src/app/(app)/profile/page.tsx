import Link from 'next/link'
import { Avatar } from '@/components/avatar'
import { Chip, ProgressBar, SectionHeader } from '@/components/ui'
import { accent } from '@/lib/accent'
import { myPursuits } from '@/lib/queries'
import { requireOnboardedProfile } from '@/lib/session'
import { signOut } from '@/app/login/actions'
import { BadgeRow, PointsChip } from '@/components/standing'
import { POINT_REASONS, type PointKind } from '@/lib/points'
import { supabaseServer } from '@/lib/supabase/server'
import type { Badge, PointEvent, UserBadge } from '@/lib/types'
import { EditProfile } from './edit-profile'

export const metadata = { title: 'Your profile' }

export default async function ProfilePage() {
  const { profile, userId } = await requireOnboardedProfile()
  const supabase = await supabaseServer()

  const [memberships, { data: badgeRows }, { data: recentPoints }] = await Promise.all([
    myPursuits(userId),
    supabase
      .from('user_badges')
      .select('*, badge:badges(*)')
      .eq('user_id', userId)
      .order('earned_at', { ascending: false }),
    supabase
      .from('point_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const badges = (badgeRows ?? []) as unknown as (UserBadge & { badge: Badge | null })[]
  const points = (recentPoints ?? []) as PointEvent[]

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex items-start gap-4">
        <Avatar profile={profile} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">
            {profile.full_name}
          </h1>
          <p className="text-sm text-ink-muted">@{profile.handle}</p>
          {profile.headline ? (
            <p className="mt-1.5 text-sm text-ink-soft">{profile.headline}</p>
          ) : null}
          {profile.location ? (
            <p className="mt-0.5 text-[12px] text-ink-faint">{profile.location}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <PointsChip points={profile.points} />
        {badges.length > 0 ? (
          <span className="text-[11px] text-ink-faint">
            {badges.length} {badges.length === 1 ? 'badge' : 'badges'}
          </span>
        ) : null}
      </div>

      {profile.bio ? <p className="prose-commons mt-5">{profile.bio}</p> : null}

      {badges.length > 0 ? (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-medium tracking-wide text-ink-muted uppercase">
            Badges
          </p>
          <BadgeRow badges={badges} limit={20} />
        </div>
      ) : null}

      {points.length > 0 ? (
        <section className="mt-9">
          <SectionHeader
            title="How you earned your points"
            hint="Only you can see this breakdown"
          />
          <ul className="card divide-y divide-line">
            {points.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[13px] text-ink-soft">
                  {POINT_REASONS[event.kind as PointKind] ?? event.kind}
                </span>
                <span className="shrink-0 text-[12px] font-medium text-accent tabular-nums">
                  +{event.points}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="mt-9 card bg-mist p-4">
          <p className="text-sm font-semibold text-ink">You have not earned points yet</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
            Points come from other people: they connect with you, they mark what you wrote as
            useful, they upvote something you shared, they use a tool you built. Twenty points in a
            pursuit lets you add to its knowledge base.
          </p>
        </div>
      )}

      {profile.skills.length > 0 ? (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-medium tracking-wide text-ink-muted uppercase">
            What you can help with
          </p>
          <div className="flex flex-wrap gap-1.5">
            {profile.skills.map((skill) => (
              <Chip key={skill} tone="accent">
                {skill}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      <section className="mt-9">
        <SectionHeader title="Your pursuits" action={{ label: 'View all', href: '/pursuits' }} />
        {memberships.length > 0 ? (
          <ul className="space-y-2.5">
            {memberships.map((membership) => {
              const tone = accent(membership.pursuit.accent)
              return (
                <li key={membership.id}>
                  <Link href={`/p/${membership.pursuit.slug}`} className="card card-hover block p-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-base ${tone.soft}`}
                      >
                        {membership.pursuit.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-ink">
                          {membership.pursuit.title}
                        </p>
                        <p className="truncate text-[11px] text-ink-muted">
                          {membership.stage?.name ?? 'No stage set'}
                        </p>
                      </div>
                      <span className="shrink-0 text-[12px] font-medium text-ink-muted tabular-nums">
                        {membership.progress}%
                      </span>
                    </div>
                    <div className="mt-2.5">
                      <ProgressBar value={membership.progress} />
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-muted">Nothing yet.</p>
        )}
      </section>

      <section className="mt-9">
        <SectionHeader title="Edit your details" hint="This is what the matching works from" />
        <EditProfile profile={profile} />
      </section>

      <section className="mt-9 border-t border-line pt-6">
        <form action={signOut}>
          <button type="submit" className="btn btn-quiet">
            Sign out
          </button>
        </form>
      </section>
    </div>
  )
}
