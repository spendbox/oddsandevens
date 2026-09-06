import Link from 'next/link'

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#5b53e8" />
      <path
        d="M10 21 L16 9 L22 21"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12.6 16.5 H19.4" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

export function Wordmark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <Logo />
      <span className="text-[15px] font-semibold tracking-[-0.02em]">Forge</span>
    </Link>
  )
}

export function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'accent' | 'lift' | 'warn' | 'rose'
}) {
  const tones = {
    neutral: 'bg-mist text-ink-muted',
    accent: 'bg-accent-soft text-accent',
    lift: 'bg-lift-soft text-lift',
    warn: 'bg-warn-soft text-warn',
    rose: 'bg-rose-soft text-rose',
  }
  return <span className={`chip ${tones[tone]}`}>{children}</span>
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
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-mist text-base">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">{body}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  )
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-[10px] bg-rose-soft px-3.5 py-3 text-[13px] leading-relaxed whitespace-pre-line text-rose"
    >
      {children}
    </p>
  )
}

export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
