'use client'

import { useActionState } from 'react'
import { Button, Field, Note, Problem } from '@/components/ui'
import { saveDisplayName, type AccountState } from './actions'

export function NameForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(saveDisplayName, {})

  return (
    <form action={action} className="grid gap-4">
      <Field
        label="Display name"
        name="display_name"
        defaultValue={defaultName}
        maxLength={40}
        placeholder="What other players see"
        hint="Shown on boxes you create and when you beat one."
      />
      {state.problem ? <Problem>{state.problem}</Problem> : null}
      {state.saved ? <Note>Saved.</Note> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save name'}
      </Button>
    </form>
  )
}
