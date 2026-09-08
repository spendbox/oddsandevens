'use client'

import Link, { useLinkStatus } from 'next/link'
import { useCallback, useState, type ComponentProps, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { cx } from './cx'

/**
 * Every button presses in, and says so — then keeps saying so.
 *
 * `active:` fires the moment a finger lands rather than when it lifts, so the
 * feedback arrives before the work does. On a slow connection that press is the
 * only thing telling somebody the tap registered at all.
 *
 * But a press that ends the instant the finger lifts is not enough, because
 * almost nothing in this app is instant: a form goes to a server action, a link
 * goes to a page that reads the database, a button in the game goes to the
 * referee and back. Half a second of a button looking exactly as it did before
 * reads as a button that did not work, and somebody taps it again — which on
 * this site can mean a second coin, a second payment or a second box.
 *
 * So being busy is not something each screen has to remember to show. These two
 * components work it out for themselves:
 *
 *  - A submit button asks `useFormStatus()` whether the form around it is in
 *    flight. Every form in the app gets this for free, server action or not.
 *  - A button whose onClick returns a promise is busy until that promise
 *    settles. Anything doing `async () => { await fetch(...) }` is covered
 *    without being told.
 *  - A link asks `useLinkStatus()` whether the navigation it started has
 *    landed. That is the "the page is loading" case, and it pairs with the
 *    loading.tsx skeletons underneath it.
 *  - `busy` forces it on, for the cases none of the above can see — work that
 *    started somewhere else on the screen.
 *
 * While busy, the button holds its label and grows a spinner, dims a little
 * rather than to the flat 40% a disabled control gets, and stops accepting
 * taps. Holding the label matters: a button that swaps its text for "Loading…"
 * changes width, and a control that resizes under a thumb is a control that
 * gets mis-tapped.
 */
const BUTTON_BASE =
  'no-select inline-flex items-center justify-center gap-2 rounded-2xl font-semibold ' +
  'transition-[transform,filter,background-color,box-shadow,opacity] duration-100 ' +
  'active:scale-[0.96] active:brightness-90 ' +
  'disabled:pointer-events-none ' +
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

export type Tone = keyof typeof TONES
export type Size = keyof typeof SIZES

/**
 * The one spinner.
 *
 * Drawn rather than imported so it inherits the text colour of whatever it is
 * sitting in — gold on ink, white on violet — without every caller having to
 * pick. `currentColor` on three sides and transparent on the fourth is the
 * whole trick.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'inline-block size-4 shrink-0 animate-spin rounded-full border-2',
        'border-current border-t-transparent opacity-80',
        className,
      )}
    />
  )
}

/** How a busy control looks, versus a merely disabled one. */
function mood(busy: boolean, disabled: boolean | undefined): string {
  if (busy) return 'pointer-events-none cursor-wait opacity-80'
  return disabled ? 'opacity-40' : ''
}

export function Button({
  tone = 'primary',
  size = 'md',
  className,
  busy,
  children,
  onClick,
  disabled,
  type,
  ...props
}: ComponentProps<'button'> & { tone?: Tone; size?: Size; busy?: boolean }) {
  // Pending for the nearest enclosing form. Outside a form it is simply false,
  // so this is safe on every button in the app.
  const form = useFormStatus()
  const [running, setRunning] = useState(false)

  // Only the button that submits the form is the one the form is busy on
  // behalf of. A "cancel" beside it must not spin.
  const kind = type ?? 'button'
  const submitting = form.pending && kind === 'submit'
  const pending = busy ?? (submitting || running)

  const press = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const result = onClick?.(event) as unknown

      // An async handler is busy until it settles. Nothing has to opt in.
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        setRunning(true)
        void (result as Promise<unknown>).finally(() => setRunning(false))
      }
    },
    [onClick],
  )

  return (
    <button
      {...props}
      type={kind}
      onClick={onClick ? press : undefined}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={cx(BUTTON_BASE, TONES[tone], SIZES[size], mood(pending, disabled), className)}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  )
}

export function ButtonLink({
  tone = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { tone?: Tone; size?: Size }) {
  return (
    <Link
      {...props}
      className={cx(BUTTON_BASE, TONES[tone], SIZES[size], 'aria-busy:opacity-80', className)}
    >
      <LinkLabel>{children}</LinkLabel>
    </Link>
  )
}

/**
 * The label of a link, plus a spinner once the navigation is under way.
 *
 * Its own component because `useLinkStatus` only answers for a Link it is
 * inside — which is also why the dimming here is on the label rather than on
 * the Link itself: the element that knows is the child, not the parent.
 */
function LinkLabel({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus()

  return (
    <span className={cx('inline-flex items-center gap-2', pending && 'opacity-80')}>
      {pending ? <Spinner /> : null}
      {children}
    </span>
  )
}
