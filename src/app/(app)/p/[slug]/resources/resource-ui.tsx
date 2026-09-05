'use client'

import { useState, useTransition } from 'react'
import type { Stage } from '@/lib/types'
import { addResource, voteResource } from '../actions'

const KINDS = ['book', 'tool', 'template', 'course', 'link', 'experience']

export function ResourceComposer({
  slug,
  pursuitId,
  stages,
}: {
  slug: string
  pursuitId: string
  stages: Stage[]
}) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card card-hover w-full p-4 text-left text-sm text-ink-faint"
      >
        Share a book, tool, template or something you worked out the hard way…
      </button>
    )
  }

  return (
    <form action={addResource} className="card p-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="pursuit_id" value={pursuitId} />

      <h3 className="text-sm font-semibold text-ink">Add to the knowledge base</h3>

      <input name="title" required className="field mt-3" placeholder="The Mom Test" />

      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        <select name="kind" className="field" defaultValue="link">
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind[0].toUpperCase() + kind.slice(1)}
            </option>
          ))}
        </select>

        <select name="stage_id" className="field" defaultValue="">
          <option value="">Useful at any stage</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              Best for: {stage.name}
            </option>
          ))}
        </select>
      </div>

      <input name="url" type="url" className="field mt-2.5" placeholder="https:// (optional)" />

      <textarea
        name="description"
        rows={2}
        className="field mt-2.5 resize-none"
        placeholder="Why it helped you, and when someone should reach for it."
      />

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Add
        </button>
      </div>
    </form>
  )
}

export function VoteButton({
  slug,
  resourceId,
  count,
  voted,
}: {
  slug: string
  resourceId: string
  count: number
  voted: boolean
}) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={(event) => {
        event.preventDefault()
        startTransition(() => {
          void voteResource(slug, resourceId)
        })
      }}
      aria-label={voted ? 'Remove your vote' : 'Mark as useful'}
      className={`flex shrink-0 flex-col items-center rounded-[9px] border px-2 py-1 text-[11px] transition-colors ${
        voted
          ? 'border-accent-line bg-accent-soft text-accent'
          : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'
      }`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="m12 5 7 8h-4v6H9v-6H5z" fill="currentColor" />
      </svg>
      <span className="tabular-nums">{count}</span>
    </button>
  )
}
