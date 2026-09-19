'use client'

import { X } from 'lucide-react'
import { useModal } from './modal'

/**
 * A panel over the screen, closed by a press outside it.
 *
 * One shell, because there are now five of these — all the teams, all the
 * members, one member, a team's settings, sharing a note — and a panel that
 * closes differently in two places in the same app is a panel nobody
 * trusts. It is the same shape as the compose box: a sheet at the bottom on
 * a phone, where a thumb is, and a panel in the middle on a desktop.
 *
 * The list inside scrolls and the panel does not grow past the window,
 * which is the whole reason these exist: a team with forty people in it is
 * a row of forty names across a bar, or it is a list in here.
 *
 * ## Why the outside press is the overlay's own click
 *
 * It used to be `useDismiss`, which closes on **pointerdown** — right for a
 * dropdown, wrong for a sheet. The panel was gone before the finger lifted,
 * so the `click` that followed landed on whatever was now underneath:
 * tapping the dark area to dismiss a sheet pressed a note row behind it, or
 * put a caret in the page. The overlay is a real element covering the whole
 * screen, so its own click is all that is needed — and a click happens on
 * the way up, on the overlay, and goes nowhere else. Escape and the page
 * lock come from `useModal`.
 */
export default function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useModal(onClose)

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-black/25"
      />
      {/*
        The box that centres the panel is also outside the panel.

        On a phone it sits along the bottom and the dark overlay behind
        takes every press that misses. On a desktop `sm:inset-y-0` makes
        it cover the whole window so the panel can be centred in it — and
        being painted after the overlay, it is what a press outside the
        panel actually lands on. Without this the dark area did nothing on
        a desktop at all. `e.target === e.currentTarget` is the test that
        it was this box and not something inside it.
      */}
      <div
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
        className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-2 sm:inset-y-0 sm:items-center"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-3 shadow-2xl"
        >
          <div className="mb-2 flex shrink-0 items-center gap-2">
            <p className="text-[14px] font-medium">{title}</p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              <X size={18} />
            </button>
          </div>
          {/* `overscroll-contain` so a flick that reaches the end of this
              list does not carry on into the page behind it. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </div>
      </div>
    </>
  )
}
