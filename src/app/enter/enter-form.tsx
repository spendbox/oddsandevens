'use client'

import { useActionState, useState } from 'react'
import { Button, Field, Note, Problem } from '@/components/ui'
import { PasswordField } from '@/components/password-field'
import { enter, enterWithPassword, sendReset, type EnterState } from './actions'

const EMPTY: EnterState = {}

/**
 * One field to start with: an email.
 *
 * Most people arriving here have just tapped somebody's box link and want to
 * play. They type an email and they are in. The password field only appears for
 * accounts that have a password — which means accounts with money attached,
 * because setting one is what claiming a prize requires.
 */
export function EnterForm({ next }: { next: string }) {
  const [emailState, emailAction, emailPending] = useActionState(enter, EMPTY)
  const [passState, passAction, passPending] = useActionState(enterWithPassword, EMPTY)
  const [resetState, resetAction, resetPending] = useActionState(sendReset, EMPTY)
  const [typed, setTyped] = useState('')

  // Once any step tells us this account has a password, stay on that step.
  const known = passState.email ?? emailState.email ?? ''
  const locked = Boolean(emailState.needsPassword || passState.needsPassword)
  const problem = passState.problem ?? emailState.problem ?? resetState.problem

  if (locked) {
    return (
      <div className="animate-rise">
        <p className="mb-1 text-sm text-mist">Welcome back</p>
        <p className="mb-6 truncate text-lg font-semibold">{known}</p>

        <form action={passAction} className="grid gap-4">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="email" value={known} />

          <PasswordField
            label="Your password"
            name="password"
            required
            autoFocus
            autoComplete="current-password"
            placeholder="Enter your password"
          />

          {problem ? <Problem>{problem}</Problem> : null}
          {resetState.sentReset ? (
            <Note>
              If that address has an account, a reset link is on its way. Check your inbox,
              and your spam folder.
            </Note>
          ) : null}

          <Button type="submit" size="lg" disabled={passPending} className="w-full">
            {passPending ? 'One moment…' : 'Sign in'}
          </Button>
        </form>

        <form action={resetAction} className="mt-4 text-center">
          <input type="hidden" name="email" value={known} />
          <button
            type="submit"
            disabled={resetPending}
            className="text-sm font-medium text-mist underline underline-offset-4
                       hover:text-chalk disabled:opacity-50"
          >
            {resetPending ? 'Sending…' : 'Forgot your password? Email me a reset link'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="animate-rise">
      <h1 className="text-2xl font-bold tracking-tight">Your email is all it takes</h1>
      <p className="mt-2 mb-6 text-sm leading-relaxed text-mist">
        No sign-up form, no confirmation email. Type your address and start playing. You
        only set a password when you win something and want to claim it.
      </p>

      <form action={emailAction} className="grid gap-4">
        <input type="hidden" name="next" value={next} />

        <Field
          label="Email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />

        {problem ? <Problem>{problem}</Problem> : null}

        <Button type="submit" tone="gold" size="lg" disabled={emailPending} className="w-full">
          {emailPending ? 'One moment…' : 'Continue'}
        </Button>
      </form>
    </div>
  )
}
