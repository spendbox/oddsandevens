'use client'

import { useState } from 'react'
import type { Stage } from '@/lib/types'
import { updateProgress } from '../actions'

export function ProgressForm({
  slug,
  pursuitId,
  stages,
  currentStageId,
  currentProgress,
}: {
  slug: string
  pursuitId: string
  stages: Stage[]
  currentStageId: string | null
  currentProgress: number
}) {
  const [progress, setProgress] = useState(currentProgress)
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold text-ink">You are {currentProgress}% of the way</p>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            {stages.find((stage) => stage.id === currentStageId)?.name ?? 'No stage set'}
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="btn btn-primary">
          Update progress
        </button>
      </div>
    )
  }

  return (
    <form
      action={async (formData) => {
        await updateProgress(formData)
        setOpen(false)
      }}
      className="card p-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="pursuit_id" value={pursuitId} />

      <h3 className="text-sm font-semibold text-ink">Where are you now?</h3>

      <label htmlFor="stage_id" className="mt-4 mb-1.5 block text-xs font-medium text-ink-soft">
        Stage
      </label>
      <select
        id="stage_id"
        name="stage_id"
        defaultValue={currentStageId ?? ''}
        className="field"
      >
        {stages.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.name} — {stage.description}
          </option>
        ))}
      </select>

      <label htmlFor="progress" className="mt-4 mb-1.5 block text-xs font-medium text-ink-soft">
        Overall progress: <span className="text-ink tabular-nums">{progress}%</span>
      </label>
      <input
        id="progress"
        name="progress"
        type="range"
        min={0}
        max={100}
        step={1}
        value={progress}
        onChange={(event) => setProgress(Number(event.target.value))}
        className="w-full accent-[#5b53e8]"
      />

      <label htmlFor="note" className="mt-4 mb-1.5 block text-xs font-medium text-ink-soft">
        What changed?
      </label>
      <textarea
        id="note"
        name="note"
        rows={2}
        placeholder="Just got my first 10 paying customers."
        className="field resize-none"
      />
      <p className="mt-1.5 text-[11px] text-ink-faint">
        A real step forward is shown to the people still standing where you just were.
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Save progress
        </button>
      </div>
    </form>
  )
}
