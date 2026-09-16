'use client'

import { CalendarClock, Check, ListTodo, X } from 'lucide-react'
import { useState } from 'react'
import type { TaskSuggestion } from '@/lib/tasks'

/**
 * "These look like things you have to do. Shall I make them tasks?"
 *
 * ## Why it asks instead of doing it
 *
 * Reading somebody's notes and quietly rewriting four of their paragraphs into
 * checkboxes is the kind of helpfulness that gets a feature switched off on
 * the first wrong guess — and a wrong guess is certain, because whether "speak
 * to Sam about the lease" is a task or a description of something that already
 * happened is not decidable from the sentence. So every line is shown with a
 * tick beside it, each one is confirmed on its own, and the whole thing is
 * dismissable. The same bargain as the writing help and the Library.
 *
 * ## Why it is a strip and not a dialog
 *
 * It appears while somebody is in the middle of typing. Anything that takes
 * the caret away from the sentence they are writing is worse than not offering
 * at all, so this sits above the page, takes no focus, and closes on Escape or
 * a press of the cross.
 *
 * ## Calendars
 *
 * A date found in the line is shown next to the task, in the writer's own
 * words rather than parsed into a timestamp — "Friday" means a different day
 * depending on when it was written, and a reminder on the wrong day is worse
 * than a reminder with no day. The wording is what a calendar's own parser
 * will want when one is connected; until then it is said plainly on screen
 * that the task lives in this document and nowhere else.
 */
export interface TaskSuggestionsProps {
  suggestions: TaskSuggestion[]
  /**
   * How many tasks the last confirmation made, or zero.
   *
   * Held by the editor rather than here, because accepting the suggestions
   * changes the document and therefore removes them — so a count kept inside
   * this component would be unmounted by its own success, and the writer would
   * never see what happened.
   */
  made: number
  /** Turns the chosen lines into task blocks. */
  onCreate: (chosen: TaskSuggestion[]) => void
  /** Stop offering these ones. */
  onDismiss: () => void
}

export default function TaskSuggestions({
  suggestions,
  made,
  onCreate,
  onDismiss,
}: TaskSuggestionsProps) {
  const [open, setOpen] = useState(false)
  /*
    Which lines are ticked. Everything starts ticked, because the common case
    is that the detector is right about most of them and unticking one is
    cheaper than ticking five. Seeded lazily and keyed by block id, so a
    suggestion that disappears as the document changes simply stops being read.
  */
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(suggestions.map((task) => task.blockId)),
  )
  /*
    A line that appeared after this list was first drawn starts ticked too.
    Adjusted during render rather than in an effect — the render-phase "a prop
    changed, so derive from it" pattern this codebase uses elsewhere — because
    in an effect the new row paints unticked for a frame and looks like a
    deliberate exclusion.
  */
  const [known, setKnown] = useState(suggestions.length)
  if (suggestions.length !== known) {
    setKnown(suggestions.length)
    setChosen((current) => {
      const next = new Set(current)
      for (const task of suggestions) if (!current.has(task.blockId)) next.add(task.blockId)
      return next
    })
  }

  if (!suggestions.length && !made) return null

  if (made) {
    return (
      <div
        role="status"
        data-print="hide"
        className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-hover)] px-3 py-2.5 text-[14px]"
      >
        <Check size={15} className="mt-0.5 shrink-0 text-[var(--color-good)]" />
        <p className="min-w-0 text-[var(--color-muted)]">
          {made === 1 ? 'That is now a task' : `Those are now ${made} tasks`} in this document —
          tick one off where it sits. Sending them to a calendar is not connected yet, so nothing
          has left this page.
        </p>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="ml-auto shrink-0 rounded p-1 text-[var(--color-faint)] hover:text-[var(--color-ink)]"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  const count = suggestions.filter((task) => chosen.has(task.blockId)).length

  if (!open) {
    return (
      <div
        data-print="hide"
        className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-hover)] px-3 py-2 text-[14px]"
      >
        <ListTodo size={15} className="shrink-0 text-[var(--color-accent)]" />
        <span className="min-w-0 text-[var(--color-muted)]">
          {suggestions.length === 1
            ? 'One line here looks like something to do.'
            : `${suggestions.length} lines here look like things to do.`}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-auto shrink-0 rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[13px] font-medium text-white"
        >
          Have a look
        </button>
        <button
          type="button"
          aria-label="Not now"
          onClick={onDismiss}
          className="shrink-0 rounded p-1 text-[var(--color-faint)] hover:text-[var(--color-ink)]"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div
      data-print="hide"
      className="mb-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-2.5 shadow-sm"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <ListTodo size={15} className="shrink-0 text-[var(--color-accent)]" />
        <span className="text-[14px] font-medium">Make these tasks?</span>
        <button
          type="button"
          aria-label="Not now"
          onClick={onDismiss}
          className="ml-auto shrink-0 rounded p-1 text-[var(--color-faint)] hover:text-[var(--color-ink)]"
        >
          <X size={14} />
        </button>
      </div>

      <ul className="space-y-0.5">
        {suggestions.map((task) => {
          const ticked = chosen.has(task.blockId)
          return (
            <li key={task.blockId}>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-[var(--color-hover)]">
                <input
                  type="checkbox"
                  checked={ticked}
                  onChange={() =>
                    setChosen((current) => {
                      const next = new Set(current)
                      if (ticked) next.delete(task.blockId)
                      else next.add(task.blockId)
                      return next
                    })
                  }
                  className="mt-[3px] h-[15px] w-[15px] shrink-0 accent-[var(--color-accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] leading-snug">{task.text}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-[var(--color-faint)]">
                    {task.due && (
                      <span className="inline-flex items-center gap-1 text-[var(--color-accent)]">
                        <CalendarClock size={11} /> {task.due}
                      </span>
                    )}
                    <span>{task.reason}</span>
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] pt-2">
        <p className="min-w-0 flex-1 text-[13px] text-[var(--color-faint)]">
          They stay in this document. A calendar is not connected yet.
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md px-2.5 py-1.5 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
        >
          Not now
        </button>
        <button
          type="button"
          disabled={!count}
          onClick={() => onCreate(suggestions.filter((task) => chosen.has(task.blockId)))}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
        >
          {count === 1 ? 'Make 1 task' : `Make ${count} tasks`}
        </button>
      </div>
    </div>
  )
}
