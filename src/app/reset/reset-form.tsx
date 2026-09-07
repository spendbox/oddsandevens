'use client'

import { useActionState } from 'react'
import { Button, Note, Problem } from '@/components/ui'
import { PasswordField } from '@/components/password-field'
import { chooseNewPassword, type ResetState } from './actions'

export function ResetForm() {
  const [state, action, pending] = useActionState<ResetState, FormData>(chooseNewPassword, {})

  return (
    <form action={action} className="grid gap-4">
      <PasswordField
        label="New password"
        name="password"
        required
        minLength={6}
        autoFocus
        autoComplete="new-password"
        placeholder="At least 6 characters"
        hint="Tap the eye to check what you have typed."
      />

      {state.problem ? <Problem>{state.problem}</Problem> : null}
      {state.done ? <Note>Password changed. You can use it to sign in anywhere.</Note> : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Saving…' : 'Set new password'}
      </Button>
    </form>
  )
}
