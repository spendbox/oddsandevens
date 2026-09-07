'use client'

import { useActionState } from 'react'
import { Button, Field, Note, Problem } from '@/components/ui'
import type { Profile } from '@/lib/types'
import { saveAccount, type AccountState } from './actions'

export function AccountForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(saveAccount, {})

  return (
    <form action={action} className="grid gap-4">
      <Field
        label="Display name"
        name="display_name"
        defaultValue={profile.display_name}
        maxLength={40}
        placeholder="What other players see"
      />

      <div className="mt-2 border-t border-white/8 pt-5">
        <p className="text-sm font-semibold">Where winnings go</p>
        <p className="mt-1 text-sm text-mist">
          Payouts are sent by bank transfer, by hand. Without these we cannot pay you.
        </p>
      </div>

      <Field
        label="Bank"
        name="bank_name"
        defaultValue={profile.bank_name}
        maxLength={60}
        placeholder="GTBank, Kuda, Opay…"
      />

      <Field
        label="Account number"
        name="account_number"
        defaultValue={profile.account_number}
        inputMode="numeric"
        maxLength={10}
        placeholder="10 digits"
      />

      <Field
        label="Account name"
        name="account_name"
        defaultValue={profile.account_name}
        maxLength={80}
        placeholder="Exactly as the bank has it"
      />

      {state.problem ? <Problem>{state.problem}</Problem> : null}
      {state.saved ? <Note>Saved.</Note> : null}

      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending ? 'Saving…' : 'Save details'}
      </Button>
    </form>
  )
}
