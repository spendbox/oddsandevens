'use client'

import { useActionState, useEffect, useState } from 'react'
import { Button, Note, Problem } from '@/components/ui'
import type { Bank } from '@/lib/paystack'
import type { Profile } from '@/lib/types'
import { verifyAndSaveBank, type BankState } from '@/app/account/actions'

/**
 * Where a win gets paid.
 *
 * The account name is not a field. The player picks their bank and types their
 * number, and the name comes back from the bank itself — so what is on screen
 * after saving is the bank's answer, not the player's guess. If it is not their
 * name, they have typed something wrong and can see that immediately.
 */
export function BankForm({
  profile,
  banks,
  onSaved,
}: {
  profile: Profile
  banks: Bank[]
  /** Told when a save lands, so a wrapper can drop back to the card view. */
  onSaved?: () => void
}) {
  const [state, action, pending] = useActionState<BankState, FormData>(verifyAndSaveBank, {})
  const [bankCode, setBankCode] = useState(profile.bank_code)

  // The action has reported a good save; let the parent close the form.
  useEffect(() => {
    if (state.saved && state.accountName) onSaved?.()
    // onSaved is recreated each render; depending on it would fire repeatedly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.saved, state.accountName])

  const chosen = banks.find((bank) => bank.code === bankCode)
  const verified = profile.account_verified_at && !state.problem
  const confirmedName = state.accountName ?? (verified ? profile.account_name : null)

  return (
    <form action={action} className="grid gap-4">
      {/* The bank's own code travels with its name, so the saved row can be read
          without needing the list again. */}
      <input type="hidden" name="bank_name" value={chosen?.name ?? profile.bank_name} />

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-mist">Your bank</span>
        <select
          name="bank_code"
          required
          value={bankCode}
          onChange={(event) => setBankCode(event.target.value)}
          className="h-12 w-full rounded-2xl border border-white/12 bg-black/30 px-4 text-base
                     text-chalk focus:border-violet/60 focus:outline-none focus:ring-2
                     focus:ring-violet/25"
        >
          <option value="">Choose your bank…</option>
          {banks.map((bank) => (
            <option key={bank.code} value={bank.code} className="bg-deep">
              {bank.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-mist">Account number</span>
        <input
          name="account_number"
          required
          inputMode="numeric"
          pattern="[0-9]{10}"
          maxLength={10}
          defaultValue={profile.account_number}
          placeholder="10 digits"
          className="tabular h-12 w-full rounded-2xl border border-white/12 bg-black/30 px-4
                     text-base tracking-widest text-chalk placeholder:tracking-normal
                     placeholder:text-dusk focus:border-violet/60 focus:outline-none
                     focus:ring-2 focus:ring-violet/25"
        />
      </label>

      {confirmedName ? (
        <div className="rounded-2xl border border-lime/25 bg-lime/10 px-4 py-3">
          <p className="text-xs font-semibold tracking-wider text-lime uppercase">
            Confirmed by your bank
          </p>
          <p className="mt-1 text-lg font-bold text-chalk">{confirmedName}</p>
          <p className="mt-0.5 text-xs text-lime/70">
            This is who the transfer will be made out to.
          </p>
        </div>
      ) : null}

      {state.problem ? <Problem>{state.problem}</Problem> : null}
      {state.saved && !confirmedName ? <Note>Saved.</Note> : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending
          ? 'Checking with your bank…'
          : confirmedName
            ? 'Check again'
            : 'Verify account'}
      </Button>
    </form>
  )
}
