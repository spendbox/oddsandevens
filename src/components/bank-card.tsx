'use client'

import { useState } from 'react'
import { BadgeCheck, Landmark, Pencil } from 'lucide-react'
import { Button } from './ui'
import { BankForm } from './bank-form'
import type { Bank } from '@/lib/paystack'
import type { Profile } from '@/lib/types'

/**
 * Saved bank details, shown as a card rather than a form.
 *
 * Once an account has been checked with the bank, re-showing the form is both
 * noise and a small invitation to break something that works. What somebody
 * wants here is confirmation: the right bank, the right last four digits, the
 * name their bank actually holds — and a way back in if any of it is wrong.
 *
 * The number is masked to its last four. There is no reason to paint a full
 * account number across a screen somebody might be holding in public, and the
 * last four are enough to recognise your own account.
 */
export function BankCard({ profile, banks }: { profile: Profile; banks: Bank[] }) {
  const [editing, setEditing] = useState(false)
  const verified = Boolean(profile.account_verified_at)

  if (!verified || editing) {
    return (
      <div>
        {editing ? (
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Change your bank account</p>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-sm text-mist underline underline-offset-4 hover:text-chalk"
            >
              Cancel
            </button>
          </div>
        ) : null}

        <BankForm profile={profile} banks={banks} onSaved={() => setEditing(false)} />
      </div>
    )
  }

  const lastFour = profile.account_number.slice(-4)

  return (
    <div>
      {/* The card. Deliberately looks like a bank card, because that is the
          thing it is standing in for. */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-violet/85 via-[#5b1fb0] to-[#1c0b3a] p-6 shadow-[0_20px_50px_-24px_rgb(168_85_247/0.8)]">
        <div
          aria-hidden
          className="absolute -top-16 -right-10 size-52 rounded-full bg-white/10 blur-2xl"
        />

        <div className="relative flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-white/15 backdrop-blur">
              <Landmark size={19} className="text-white" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wider text-white/60 uppercase">
                Paying into
              </p>
              <p className="truncate font-semibold text-white">
                {profile.bank_name || 'Your bank'}
              </p>
            </div>
          </div>

          <span className="flex shrink-0 items-center gap-1 rounded-full bg-lime/20 px-2.5 py-1 text-xs font-semibold text-lime ring-1 ring-inset ring-lime/40">
            <BadgeCheck size={13} /> Verified
          </span>
        </div>

        <p className="tabular relative mt-8 text-2xl font-semibold tracking-[0.28em] text-white">
          ••••&nbsp;&nbsp;••••&nbsp;&nbsp;{lastFour}
        </p>

        <div className="relative mt-6">
          <p className="text-xs font-medium tracking-wider text-white/60 uppercase">
            Account name
          </p>
          <p className="truncate font-semibold text-white">{profile.account_name}</p>
          <p className="mt-1 text-xs text-white/60">
            Confirmed with your bank on{' '}
            {new Date(profile.account_verified_at as string).toLocaleDateString('en-NG', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-dusk">Payouts land within one week.</p>
        <Button type="button" tone="ghost" size="sm" onClick={() => setEditing(true)}>
          <Pencil size={14} /> Edit
        </Button>
      </div>
    </div>
  )
}
