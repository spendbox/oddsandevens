import Link from 'next/link'
import { accent, categoryLabel } from '@/lib/accent'
import type { Pursuit, Stage } from '@/lib/types'
import { ProgressBar } from './ui'

/**
 * The tile used on Home for a pursuit you are already in: what it is, how far
 * you have come, and the stage you are standing at right now.
 */
export function IntentionCard({
  pursuit,
  progress,
  stage,
}: {
  pursuit: Pursuit
  progress: number
  stage: Stage | null
}) {
  const tone = accent(pursuit.accent)

  return (
    <Link
      href={`/p/${pursuit.slug}`}
      className={`card card-hover flex min-w-0 flex-col justify-between gap-6 p-4 ${tone.soft}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`chip ${tone.chip}`}>{categoryLabel(pursuit.category)}</span>
        <span className="text-lg leading-none">{pursuit.emoji}</span>
      </div>

      <div>
        <h3 className="text-[15px] leading-snug font-semibold tracking-[-0.01em] text-ink">
          {pursuit.title}
        </h3>

        <div className="mt-3.5">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[11px] font-medium text-ink-muted tabular-nums">{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/70">
            <div
              className={`h-full rounded-full ${tone.bar} transition-[width] duration-500`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${tone.bar}`} />
            {stage?.name ?? 'Not started'}
          </p>
        </div>
      </div>
    </Link>
  )
}

/** The tile used everywhere you are being offered a pursuit you have not joined. */
export function PursuitCard({
  pursuit,
  reason,
  joined,
}: {
  pursuit: Pursuit
  reason?: string
  joined?: boolean
}) {
  const tone = accent(pursuit.accent)

  return (
    <Link href={`/p/${pursuit.slug}`} className="card card-hover flex items-start gap-3 p-4">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-lg ${tone.soft}`}
      >
        {pursuit.emoji}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm leading-snug font-semibold text-ink">{pursuit.title}</h3>
          {joined ? <span className="chip bg-mist text-ink-muted">Joined</span> : null}
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">
          {pursuit.tagline}
        </p>
        <p className="mt-2 text-[11px] text-ink-faint">
          {pursuit.member_count.toLocaleString()} pursuing this
          {reason ? <span className="text-accent"> · {reason}</span> : null}
        </p>
      </div>
    </Link>
  )
}

export function CollectiveBar({ value, accentName }: { value: number; accentName: string }) {
  const tone = accent(accentName)
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${value}%` }} />
    </div>
  )
}

export { ProgressBar }
