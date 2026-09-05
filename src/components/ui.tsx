import Link from 'next/link'

export function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'accent' | 'lift' | 'warn' | 'rose' | 'sky'
}) {
  const tones = {
    neutral: 'bg-mist text-ink-muted',
    accent: 'bg-accent-soft text-accent',
    lift: 'bg-lift-soft text-lift',
    warn: 'bg-warn-soft text-warn',
    rose: 'bg-rose-soft text-rose',
    sky: 'bg-sky-soft text-sky',
  }
  return <span className={`chip ${tones[tone]}`}>{children}</span>
}

export function ProgressBar({
  value,
  tone = 'accent',
  className = '',
}: {
  value: number
  tone?: 'accent' | 'lift' | 'warn' | 'rose' | 'sky'
  className?: string
}) {
  const tones = {
    accent: 'bg-accent',
    lift: 'bg-lift',
    warn: 'bg-warn',
    rose: 'bg-rose',
    sky: 'bg-sky',
  }
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-line ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full ${tones[tone]} transition-[width] duration-500`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

export function SectionHeader({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: { label: string; href: string }
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-ink-muted">{hint}</p> : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="shrink-0 text-xs font-medium text-accent hover:text-accent-hover"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  children,
}: {
  icon: string
  title: string
  body: string
  children?: React.ReactNode
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-mist text-base">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-ink-muted">{body}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  )
}

/** "2h ago", "3 days ago" — short enough to sit inside a dense list. */
export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
