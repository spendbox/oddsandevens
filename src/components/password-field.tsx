'use client'

import { useState, type ComponentProps } from 'react'
import { cx } from './ui'

/**
 * A password field with an eye on it.
 *
 * Typing a password blind on a phone keyboard is where most failed sign-ins
 * come from, so every password field in Spendbox can be revealed. The button is
 * a real button with a real label, so a screen reader announces what it does
 * and what state it is in rather than reading out a decorative icon.
 */
export function PasswordField({
  label,
  hint,
  className,
  ...props
}: ComponentProps<'input'> & { label: string; hint?: string }) {
  const [shown, setShown] = useState(false)

  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-sm font-medium text-mist">{label}</span>

      <div className="relative">
        <input
          {...props}
          type={shown ? 'text' : 'password'}
          className="h-12 w-full rounded-2xl border border-white/12 bg-black/30 pl-4 pr-14
                     text-base text-chalk placeholder:text-dusk focus:border-violet/60
                     focus:outline-none focus:ring-2 focus:ring-violet/25"
        />

        <button
          type="button"
          onClick={() => setShown((was) => !was)}
          aria-pressed={shown}
          aria-label={shown ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 grid w-13 place-items-center rounded-r-2xl
                     text-mist transition hover:text-chalk focus-visible:outline-2
                     focus-visible:outline-offset-2 focus-visible:outline-cyan"
        >
          {shown ? <EyeOff /> : <Eye />}
        </button>
      </div>

      {hint ? <span className="mt-1.5 block text-xs text-dusk">{hint}</span> : null}
    </label>
  )
}

function Eye() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}

function EyeOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9.9 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.5 8.2A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1 0 1.9-.2 2.7-.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
