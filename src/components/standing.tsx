import type { Badge, UserBadge } from '@/lib/types'

/**
 * Where a points total is allowed to appear.
 *
 * Not on a discussion post, not beside a name on the progress board, not in a
 * member list. A visible score next to what somebody wrote changes how it gets
 * read, and a pursuit works because people answer each other as equals.
 *
 * It shows in two places only: on a profile, where you went looking for it, and
 * on a "people you should meet" card, where it is part of the case for spending
 * your time on this person.
 */
export function PointsChip({ points, subtle }: { points: number; subtle?: boolean }) {
  return (
    <span
      className={`chip ${subtle ? 'bg-mist text-ink-muted' : 'bg-accent-soft text-accent'}`}
      title="Points earned when other people found this person useful"
    >
      {points.toLocaleString()} {points === 1 ? 'point' : 'points'}
    </span>
  )
}

export function BadgeRow({
  badges,
  limit = 8,
}: {
  badges: (UserBadge & { badge: Badge | null })[]
  limit?: number
}) {
  if (badges.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.slice(0, limit).map((earned) => (
        <span
          key={earned.id}
          title={
            earned.label
              ? `${earned.badge?.name ?? earned.badge_slug}: ${earned.label}`
              : (earned.badge?.description ?? '')
          }
          className="chip bg-mist text-ink-soft"
        >
          {earned.badge?.emoji ?? '🏅'} {earned.label || (earned.badge?.name ?? earned.badge_slug)}
        </span>
      ))}
      {badges.length > limit ? (
        <span className="chip bg-mist text-ink-faint">+{badges.length - limit}</span>
      ) : null}
    </div>
  )
}
