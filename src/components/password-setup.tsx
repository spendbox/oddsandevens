'use client'

import { useActionState } from 'react'
import { Button, Note, Problem } from '@/components/ui'
import { PasswordField } from '@/components/password-field'
import { choosePassword, type PasswordState } from '@/app/account/actions'

/**
 * Giving an account a password for the first time, or changing it.
 *
 * Asked for twice, because there is no "check your email" step to catch a typo
 * — and because once this is set, the password is the only way back into the
 * account.
 */
export function PasswordSetup({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(choosePassword, {})

  return (
    <form action={action} className="grid gap-4">
      <PasswordField
        label={hasPassword ? 'New password' : 'Choose a password'}
        name="password"
        required
        minLength={6}
        autoComplete="new-password"
        placeholder="At least 6 characters"
      />
      <PasswordField
        label="Type it again"
        name="password_again"
        required
        minLength={6}
        autoComplete="new-password"
        placeholder="The same password"
        hint="Tap the eye on either field to check what you have typed."
      />

      {state.problem ? <Problem>{state.problem}</Problem> : null}
      {state.saved ? (
        <Note>
          Password set. From now on your email alone will not open this account — which is
          exactly what protects anything you win.
        </Note>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
      </Button>
    </form>
  )
}
