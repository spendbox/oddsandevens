import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

/** Joins class names, ignoring the false/undefined branches. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const BUTTON_BASE =
  'no-select inline-flex items-center justify-center gap-2 rounded-2xl font-semibold ' +
  'transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan'

const TONES = {
  primary:
    'bg-linear-to-b from-violet to-[#7c2fe0] text-white shadow-[0_14px_34px_-14px_#a855f7] ' +
    'hover:brightness-110',
  gold:
    'bg-linear-to-b from-gold to-[#e8a615] text-ink shadow-[0_14px_34px_-14px_#ffc94a] ' +
    'hover:brightness-105',
  ghost: 'bg-white/6 text-chalk ring-1 ring-inset ring-white/12 hover:bg-white/12',
  danger: 'bg-rose/90 text-white hover:bg-rose',
} as const

const SIZES = {
  sm: 'h-10 px-4 text-sm',
  md: 'h-12 px-5 text-[15px]',
  lg: 'h-14 px-7 text-base',
} as const

type Tone = keyof typeof TONES
type Size = keyof typeof SIZES

export function Button({
  tone = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<'button'> & { tone?: Tone; size?: Size }) {
  return <button {...props} className={cx(BUTTON_BASE, TONES[tone], SIZES[size], className)} />
}

export function ButtonLink({
  tone = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { tone?: Tone; size?: Size }) {
  return <Link {...props} className={cx(BUTTON_BASE, TONES[tone], SIZES[size], className)} />
}

export function Card({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return <div className={cx('pane rounded-3xl p-5 sm:p-6', className)}>{children}</div>
}

export function Pill({
  children,
  tone = 'violet',
  className,
}: {
  children: ReactNode
  tone?: 'violet' | 'cyan' | 'lime' | 'gold' | 'rose' | 'quiet'
  className?: string
}) {
  const tones = {
    violet: 'bg-violet/15 text-violet-soft ring-violet/30',
    cyan: 'bg-cyan/15 text-cyan ring-cyan/30',
    lime: 'bg-lime/15 text-lime ring-lime/30',
    gold: 'bg-gold/15 text-gold ring-gold/30',
    rose: 'bg-rose/15 text-rose ring-rose/30',
    quiet: 'bg-white/6 text-mist ring-white/12',
  }

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** A labelled text input, sized for thumbs. */
export function Field({
  label,
  hint,
  className,
  ...props
}: ComponentProps<'input'> & { label: string; hint?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-sm font-medium text-mist">{label}</span>
      <input
        {...props}
        className="h-12 w-full rounded-2xl border border-white/12 bg-black/30 px-4 text-base
                   text-chalk placeholder:text-dusk focus:border-violet/60 focus:outline-none
                   focus:ring-2 focus:ring-violet/25"
      />
      {hint ? <span className="mt-1.5 block text-xs text-dusk">{hint}</span> : null}
    </label>
  )
}

/** Something went wrong, said plainly and in one place. */
export function Problem({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p
      role="alert"
      className="rounded-2xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose"
    >
      {children}
    </p>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-lime/25 bg-lime/10 px-4 py-3 text-sm text-lime">
      {children}
    </p>
  )
}

/** The empty state: a screen with nothing on it should still say something. */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-white/12 px-6 py-10 text-center">
      <p className="font-semibold text-chalk">{title}</p>
      {children ? <div className="mt-2 text-sm text-mist">{children}</div> : null}
    </div>
  )
}
