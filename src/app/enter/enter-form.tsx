'use client'

import { useActionState } from 'react'
import { ArrowLeft, ArrowRight, LogIn, Sparkles } from 'lucide-react'
import { Button, Field, Note, Problem } from '@/components/ui'
import { PasswordField } from '@/components/password-field'
import { checkEmail, signIn, signUp, sendReset, type EnterState } from './actions'

const START: EnterState = { step: 'email' }

/**
 * Two steps: your email, then your password.
 *
 * Not a pair of tabs. Somebody arriving from a shared box link does not
 * necessarily know whether they already have an account here — they know their
 * email address. So the first step takes that and the app works out which of
 * the two this is, and the second step asks for the right thing.
 */
export function EnterForm({ next }: { next: string }) {
  const [emailState, emailAction, emailPending] = useActionState(checkEmail, START)
  const [signInState, signInAction, signInPending] = useActionState(signIn, START)
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, START)
  const [resetState, resetAction, resetPending] = useActionState(sendReset, START)

  // The latest step any of the four actions has reported.
  const state = [signUpState, signInState, resetState, emailState].find(
    (candidate) => candidate.step && candidate.step !== 'email',
  )
  const step = state?.step ?? 'email'
  const email = state?.email ?? emailState.email ?? ''
  const problem =
    signUpState.problem ?? signInState.problem ?? resetState.problem ?? emailState.problem

  if (step === 'email') {
    return (
      <div className="animate-rise">
        <h1 className="text-2xl font-bold tracking-tight">Sign in or create an account</h1>
        <p className="mt-2 mb-6 text-sm leading-relaxed text-mist">
          An email and a password. That is the whole sign-up — no username to think of, no
          confirmation email to wait for.
        </p>

        <form action={emailAction} className="grid gap-4">
          <Field
            label="Email"
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            defaultValue={email}
          />

          {problem ? <Problem>{problem}</Problem> : null}

          <Button type="submit" tone="gold" size="lg" disabled={emailPending} className="w-full">
            {emailPending ? 'One moment…' : 'Continue'}
            {emailPending ? null : <ArrowRight size={18} />}
          </Button>
        </form>
      </div>
    )
  }

  const creating = step === 'create'
  const action = creating ? signUpAction : signInAction
  const pending = creating ? signUpPending : signInPending

  return (
    <div className="animate-rise">
      <p className="mb-1 flex items-center gap-2 text-sm text-mist">
        {creating ? <Sparkles size={15} className="text-gold" /> : <LogIn size={15} />}
        {creating ? 'Creating your account' : 'Welcome back'}
      </p>
      <p className="mb-6 truncate text-lg font-semibold">{email}</p>

      <form action={action} className="grid gap-4">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="email" value={email} />

        <PasswordField
          label={creating ? 'Choose a password' : 'Your password'}
          name="password"
          required
          minLength={6}
          autoFocus
          autoComplete={creating ? 'new-password' : 'current-password'}
          placeholder={creating ? 'At least 6 characters' : 'Enter your password'}
          hint={
            creating
              ? 'Tap the eye to check it. You can pick a display name later.'
              : undefined
          }
        />

        {problem ? <Problem>{problem}</Problem> : null}
        {resetState.sentReset ? (
          <Note>
            If that address has an account, a reset link is on its way. Check your inbox, and
            your spam folder.
          </Note>
        ) : null}

        <Button type="submit" tone="gold" size="lg" disabled={pending} className="w-full">
          {pending ? 'One moment…' : creating ? 'Create account and play' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-5 flex items-center justify-between gap-3 text-sm">
        {/* Submitting the email step again with a blank address is what takes us
            back, so this is a real form rather than client-side state. */}
        <form action={emailAction}>
          <input type="hidden" name="email" value="" />
          <button
            type="submit"
            className="flex items-center gap-1.5 text-dusk hover:text-mist"
          >
            <ArrowLeft size={14} /> Use a different email
          </button>
        </form>

        {creating ? null : (
          <form action={resetAction}>
            <input type="hidden" name="email" value={email} />
            <button
              type="submit"
              disabled={resetPending}
              className="font-medium text-mist underline underline-offset-4 hover:text-chalk disabled:opacity-50"
            >
              {resetPending ? 'Sending…' : 'Forgot password?'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
