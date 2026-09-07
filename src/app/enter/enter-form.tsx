'use client'

import { useActionState, useState } from 'react'
import { Button, Field, Problem } from '@/components/ui'
import { signIn, signUp, type EnterState } from './actions'

const EMPTY: EnterState = {}

/**
 * One form, two modes. Sign in and sign up ask for almost the same thing, and a
 * person arriving from a shared box link should not have to work out which page
 * they are supposed to be on.
 */
export function EnterForm({ next }: { next: string }) {
  const [mode, setMode] = useState<'in' | 'up'>('up')
  const [inState, inAction, inPending] = useActionState(signIn, EMPTY)
  const [upState, upAction, upPending] = useActionState(signUp, EMPTY)

  const joining = mode === 'up'
  const state = joining ? upState : inState
  const pending = joining ? upPending : inPending

  return (
    <div className="animate-rise">
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-2xl bg-black/30 p-1">
        {(['up', 'in'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            aria-pressed={mode === value}
            className={
              'no-select h-11 rounded-xl text-sm font-semibold transition ' +
              (mode === value ? 'bg-violet text-white' : 'text-mist hover:text-chalk')
            }
          >
            {value === 'up' ? 'Create account' : 'Sign in'}
          </button>
        ))}
      </div>

      <form action={joining ? upAction : inAction} className="grid gap-4">
        <input type="hidden" name="next" value={next} />

        {joining ? (
          <Field
            label="Your name"
            name="name"
            autoComplete="name"
            placeholder="What should we call you?"
            maxLength={40}
          />
        ) : null}

        <Field
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
        />

        <Field
          label="Password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete={joining ? 'new-password' : 'current-password'}
          placeholder="At least 6 characters"
          hint={joining ? 'No confirmation email. You are in straight away.' : undefined}
        />

        {state.problem ? <Problem>{state.problem}</Problem> : null}

        <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
          {pending ? 'One moment…' : joining ? 'Create account' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}
