'use client'

import { useActionState } from 'react'
import { Button, Problem } from '@/components/ui'
import { PasswordField } from '@/components/password-field'
import { chooseNewPassword, type ResetState } from './actions'

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(chooseNewPassword, {})

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />

      <PasswordField
        label="New password"
        name="password"
        required
        minLength={6}
        autoFocus
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

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Saving…' : 'Set new password'}
      </Button>
    </form>
  )
}
