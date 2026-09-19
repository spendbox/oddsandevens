'use client'

import { useEffect, useRef } from 'react'
import { useModal } from './modal'

/**
 * A question, asked once, before something that cannot be taken back by
 * pressing the same thing again.
 *
 * ## Why a dialog rather than an inline "are you sure?"
 *
 * Because the thing being asked about is a row in a list somebody is
 * scrolling. An inline confirmation turns one row into two and moves every row
 * under it, which is exactly the wrong thing to do to a list a thumb is
 * already moving through — and it can be dismissed by the same flick that
 * started it. A sheet stops the list, says what will happen to which note, and
 * takes a deliberate press either way.
 *
 * The trash's own "delete for good" stays inline, because by then the list has
 * stopped: you are in the trash on purpose, looking at four rows.
 */
export default function Confirm({
  open,
  title,
  body,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const keep = useRef<HTMLButtonElement>(null)

  /*
    The safe answer takes the focus, so Return does the harmless thing and the
    keyboard can reach both.
  */
  useEffect(() => {
    if (!open) keep.current?.blur()
    else keep.current?.focus()
  }, [open])

  if (!open) return null
  return <Asking keep={keep} title={title} body={body} confirmLabel={confirmLabel} onConfirm={onConfirm} onCancel={onCancel} />
}

/**
 * The question itself, as its own component so the modal rules are hooks.
 *
 * `Confirm` takes an `open` flag rather than being mounted and unmounted by
 * its caller — every one of them keeps the thing being asked about in state
 * — and a hook cannot be called conditionally. So the inside is a component
 * that exists only while the question does, and `useModal` locks the page
 * and binds Escape for exactly that long.
 */
function Asking({
  keep,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  keep: React.RefObject<HTMLButtonElement | null>
  title: string
  body?: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  useModal(onCancel)

  return (
    <>
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="fixed inset-0 z-[70] bg-black/30"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Centred by a flex parent rather than by `left-1/2`: an inline or
        // higher-specificity horizontal position is what collapses a
        // full-width sheet to the width of its own text on a phone.
        className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center"
      >
        <div className="w-full max-w-sm rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-4 shadow-2xl">
          <p className="text-[16px] font-medium">{title}</p>
          {body && <p className="mt-1 text-[14px] text-[var(--color-muted)]">{body}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              ref={keep}
              type="button"
              onClick={onCancel}
              className="rounded-full px-4 py-2.5 text-[14px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-full bg-[var(--color-danger)] px-4 py-2.5 text-[14px] font-medium text-white hover:opacity-90"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
