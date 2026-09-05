'use client'

import { useState, useTransition } from 'react'
import { joinPursuit, leavePursuit } from './actions'

export function JoinButton({
  slug,
  pursuitId,
  isMember,
}: {
  slug: string
  pursuitId: string
  isMember: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [asking, setAsking] = useState(false)
  const [intent, setIntent] = useState('')

  if (isMember) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm('Leave this pursuit? Your progress here will be removed.')) return
          startTransition(() => {
            void leavePursuit(slug, pursuitId)
          })
        }}
        className="btn btn-quiet"
      >
        {pending ? 'Leaving…' : 'Leave'}
      </button>
    )
  }

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="btn btn-primary px-5">
        Join this pursuit
      </button>
    )
  }

  return (
    <div className="card w-full max-w-sm p-3">
      <label htmlFor="intent" className="mb-1.5 block text-xs font-medium text-ink-soft">
        What are you here to do?
      </label>
      <textarea
        id="intent"
        rows={2}
        value={intent}
        onChange={(event) => setIntent(event.target.value)}
        placeholder="Get my first ten paying customers."
        className="field resize-none"
      />
      <p className="mt-1.5 text-[11px] text-ink-faint">
        This is what other members see when Commons suggests you to them.
      </p>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(() => {
              void joinPursuit(slug, pursuitId, intent)
            })
          }
          className="btn btn-primary flex-1"
        >
          {pending ? 'Joining…' : 'Join'}
        </button>
        <button type="button" onClick={() => setAsking(false)} className="btn btn-quiet">
          Cancel
        </button>
      </div>
    </div>
  )
}
