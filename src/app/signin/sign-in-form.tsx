'use client'

import { useActionState, useState } from 'react'
import { ErrorNote } from '@/components/ui'
import { signIn, signUp, type AuthState } from './actions'

const initial: AuthState = { error: null }

export function SignInForm({ mode, next }: { mode: 'signin' | 'signup'; next: string }) {
  const [isSignup, setIsSignup] = useState(mode === 'signup')
  const [state, formAction, pending] = useActionState(isSignup ? signUp : signIn, initial)

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">
        {isSignup ? 'Create your account' : 'Welcome back'}
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        {isSignup
          ? 'One account, and every tool you build lives in it.'
          : 'Sign in to your tools.'}
      </p>

      <form action={formAction} className="mt-7 space-y-3.5">
        <input type="hidden" name="next" value={next} />

        {isSignup ? (
          <div>
            <label htmlFor="name" className="label">
              Your name
            </label>
            <input id="name" name="name" autoComplete="name" className="field" placeholder="Ada Lovelace" />
          </div>
        ) : null}

        <div>
          <label htmlFor="email" className="label">
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
          <label htmlFor="password" className="label">
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

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}

        <button type="submit" disabled={pending} className="btn btn-primary w-full py-2.5">
          {pending ? 'One moment…' : isSignup ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p className="mt-5 text-center text-[13px] text-ink-muted">
        {isSignup ? 'Already have an account?' : 'New to Forge?'}{' '}
        <button
          type="button"
          onClick={() => setIsSignup((value) => !value)}
          className="font-medium text-accent hover:text-accent-hover"
        >
          {isSignup ? 'Sign in' : 'Create one'}
        </button>
      </p>
    </div>
  )
}
