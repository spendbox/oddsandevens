'use client'

import { X } from 'lucide-react'
import { useRef } from 'react'
import { useDismiss } from './dismiss'

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
  const panel = useRef<HTMLDivElement>(null)
  useDismiss(onClose, panel)

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-black/25"
      />
      <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-2 sm:inset-y-0 sm:items-center">
        <div
          ref={panel}
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
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </>
  )
}
