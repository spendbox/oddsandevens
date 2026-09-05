'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { signIn, signUp, type AuthState } from './actions'

const initial: AuthState = { error: null }

export function LoginForm({ mode, next }: { mode: 'signin' | 'signup'; next: string }) {
  const [isSignup, setIsSignup] = useState(mode === 'signup')
  const action = isSignup ? signUp : signIn
  const [state, formAction, pending] = useActionState(action, initial)

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">
        {isSignup ? 'Create your account' : 'Welcome back'}
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        {isSignup
          ? 'One account, and every pursuit you care about.'
          : 'Sign in to pick up where your pursuits left off.'}
      </p>

      <form action={formAction} className="mt-7 space-y-3.5">
        <input type="hidden" name="next" value={next} />

        {isSignup ? (
          <div>
            <label htmlFor="name" className="mb-1.5 block text-xs font-medium text-ink-soft">
              Your name
            </label>
            <input
              id="name"
              name="name"
              autoComplete="name"
              className="field"
              placeholder="Ada Lovelace"
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-ink-soft">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="field"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-ink-soft">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            className="field"
            placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
          />
        </div>

        {state.error ? (
          <p
            role="alert"
            className="rounded-[10px] bg-rose-soft px-3 py-2.5 text-[13px] leading-relaxed text-rose"
          >
            {state.error}
          </p>
        ) : null}

        <button type="submit" disabled={pending} className="btn btn-primary w-full py-2.5">
          {pending ? 'One moment…' : isSignup ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p className="mt-5 text-center text-[13px] text-ink-muted">
        {isSignup ? 'Already have an account?' : 'New to Commons?'}{' '}
        <button
          type="button"
          onClick={() => setIsSignup((value) => !value)}
          className="font-medium text-accent hover:text-accent-hover"
        >
          {isSignup ? 'Sign in' : 'Create one'}
        </button>
      </p>

      <p className="mt-8 text-center text-xs text-ink-faint">
        <Link href="/" className="hover:text-ink-muted">
          Back to home
        </Link>
      </p>
    </div>
  )
}
