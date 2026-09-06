'use client'

import { useRef, useState } from 'react'
import type { Stage } from '@/lib/types'
import { completeStage } from '../actions'

/**
 * Finishing a stage costs you a paragraph.
 *
 * That is the whole point. The account you write is what the people still on
 * this stage will read, and it is why moving forward makes the pursuit better
 * rather than just moving a marker.
 */
export function CompleteStage({
  slug,
  pursuitId,
  stage,
  position,
  total,
}: {
  slug: string
  pursuitId: string
  stage: Stage
  position: number
  total: number
}) {
  const [open, setOpen] = useState(false)
  const form = useRef<HTMLFormElement>(null)

  if (!open) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">
            Stage {position} of {total}
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">{stage.name}</p>
          <p className="mt-0.5 text-[12px] text-ink-muted">{stage.description}</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="btn btn-primary shrink-0">
          I have finished this stage
        </button>
      </div>
    )
  }

  return (
    <form
      ref={form}
      action={async (formData) => {
        await completeStage(formData)
        form.current?.reset()
        setOpen(false)
      }}
      className="card p-4 sm:p-5"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="pursuit_id" value={pursuitId} />
      <input type="hidden" name="stage_id" value={stage.id} />

      <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">
        Finishing stage {position} of {total}
      </p>
      <h3 className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-ink">{stage.name}</h3>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
        Everyone still on this stage will read this. Write it for them, not for the record.
      </p>

      <label htmlFor="what_i_did" className="mt-5 mb-1.5 block text-xs font-medium text-ink-soft">
        What did you actually do?
      </label>
      <textarea
        id="what_i_did"
        name="what_i_did"
        rows={4}
        required
        autoFocus
        className="field resize-none"
        placeholder="I interviewed 12 people before writing any code. Six said they would pay; two actually did."
      />

      <label htmlFor="what_was_hard" className="mt-4 mb-1.5 block text-xs font-medium text-ink-soft">
        What was hard, and how did you get past it?
      </label>
      <textarea
        id="what_was_hard"
        name="what_was_hard"
        rows={3}
        className="field resize-none"
        placeholder="I kept pitching instead of listening. Writing the questions down beforehand fixed it."
      />

      <p className="mt-3 text-[11px] text-ink-faint">
        This is posted to the discussion, you move to the next stage, and you earn a badge for
        this one.
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet">
          Not yet
        </button>
        <button type="submit" className="btn btn-primary">
          Finish this stage
        </button>
      </div>
    </form>
  )
}
