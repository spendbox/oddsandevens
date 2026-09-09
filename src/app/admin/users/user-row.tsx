'use client'

import { useActionState, useState } from 'react'
import { Trash2, TriangleAlert } from 'lucide-react'
import { Button, Card, Note, Pill, Problem } from '@/components/ui'
import { naira } from '@/lib/money'
import { deletePlayer, type DeleteState } from './actions'

export type PlayerRow = {
  id: string
  email: string
  displayName: string
  coins: number
  boxes: number
  openBoxes: number
  owed: number
  /** Money they have actually paid in, in naira. */
  paidIn: number
  createdAt: string
}

export function UserRow({ player }: { player: PlayerRow }) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deletePlayer, {})
  const [confirming, setConfirming] = useState(false)

  if (state.done) {
    return (
      <Card className="border-lime/25 bg-lime/8">
        <Note>{state.done}</Note>
      </Card>
    )
  }

  const blocked = player.openBoxes > 0 || player.owed > 0

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{player.displayName || 'No name'}</p>
          <p className="truncate text-sm text-mist">{player.email}</p>
          <p className="mt-1.5 text-xs text-dusk">
            Joined{' '}
            {new Date(player.createdAt).toLocaleDateString('en-NG', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Pill tone="gold">{player.coins} coins</Pill>
          {player.owed > 0 ? <Pill tone="rose">owed {naira(player.owed)}</Pill> : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-dusk">
        <span>
          <span className="tabular text-mist">{player.boxes}</span> boxes
        </span>
        <span>
          <span className="tabular text-mist">{player.openBoxes}</span> open
        </span>
        {player.paidIn > 0 ? (
          <span>
            paid in <span className="tabular text-mist">{naira(player.paidIn)}</span>
          </span>
        ) : null}
      </div>

      {confirming ? (
        <form action={action} className="mt-4 grid gap-3 border-t border-white/8 pt-4">
          <input type="hidden" name="id" value={player.id} />

          <p className="flex items-start gap-2 text-sm text-rose">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            This deletes their account, their games and their history. It cannot be undone.
          </p>

          {player.paidIn > 0 ? (
            <p className="rounded-xl border border-gold/25 bg-gold/8 px-3 py-2 text-xs leading-relaxed text-gold">
              They have paid in {naira(player.paidIn)}. Deleting them removes the record of
              those payments from Spendbox — Paystack keeps its own, but your side of the
              accounting will no longer show them.
            </p>
          ) : null}

          <label className="block">
            <span className="mb-1.5 block text-xs text-mist">
              Type <span className="font-mono text-chalk">{player.email}</span> to confirm
            </span>
            <input
              name="confirm"
              autoComplete="off"
              className="h-11 w-full rounded-xl border border-white/12 bg-black/30 px-3 text-sm
                         text-chalk focus:border-rose/60 focus:outline-none"
            />
          </label>

          {state.problem ? <Problem>{state.problem}</Problem> : null}

          <div className="flex gap-2">
            <Button type="submit" tone="danger" size="sm" disabled={pending}>
              {pending ? 'Deleting…' : 'Delete permanently'}
            </Button>
            <Button
              type="button"
              tone="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 border-t border-white/8 pt-4">
          {blocked ? (
            <p className="text-xs text-dusk">
              {player.openBoxes > 0
                ? 'Has an open box — people are playing it, so it cannot be deleted yet.'
                : 'Still owed a payout — settle it before deleting the account.'}
            </p>
          ) : (
            <Button type="button" tone="ghost" size="sm" onClick={() => setConfirming(true)}>
              <Trash2 size={14} /> Delete player
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
