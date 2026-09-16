'use client'

import { ChevronDown, RotateCcw, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { TRASH_DAYS, expiryLabel } from '@/lib/trash'
import type { Doc } from '@/lib/types'

/**
 * The trash, at the foot of the home screen.
 *
 * It used to sit under the documents in the sidebar, which put "delete for
 * good" one row below the file somebody was working in. It is a safety net,
 * not a place anyone wants to look at, so it lives on the screen people reach
 * deliberately — collapsed by default, and absent entirely when empty.
 *
 * Every row says when it will go. "Deletes in 4 days" is the fact someone
 * needs in order to decide whether to act now, and it is not something they
 * can work out from a deletion date they never saw.
 */
export default function TrashSection({
  docs,
  onRestore,
  onPurge,
  onEmpty,
}: {
  docs: Doc[]
  onRestore: (id: string) => void
  onPurge: (id: string) => void
  onEmpty: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)

  if (docs.length === 0) return null

  return (
    <div className="px-1 py-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
      >
        <ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
        <Trash2 size={14} />
        <span className="font-medium">Trash</span>
        <span className="ml-auto text-[var(--color-faint)]">{docs.length}</span>
      </button>

      {open && (
        <div className="mt-1 max-h-72 overflow-y-auto">
          <p className="px-2 pb-1 text-[13px] leading-snug text-[var(--color-faint)]">
            Kept for {TRASH_DAYS} days, then deleted for good.
          </p>

          {docs.map((item) => (
            <div key={item.id} className="group/trash rounded-md hover:bg-[var(--color-hover)]">
              <div className="flex items-center gap-1 px-2 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-[var(--color-muted)]">
                    {item.title.trim() || 'Untitled'}
                  </span>
                  <span className="block truncate text-[13px] text-[var(--color-faint)]">
                    {expiryLabel(item)}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Restore ${item.title.trim() || 'Untitled'}`}
                  title="Put it back"
                  onClick={() => onRestore(item.id)}
                  className="shrink-0 rounded p-1 text-[var(--color-faint)] opacity-0 transition-opacity group-focus-within/trash:opacity-100 group-hover/trash:opacity-100 hover:text-[var(--color-good)]"
                >
                  <RotateCcw size={13} />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${item.title.trim() || 'Untitled'} permanently`}
                  title="Delete permanently"
                  onClick={() => setConfirming(item.id)}
                  className="shrink-0 rounded p-1 text-[var(--color-faint)] opacity-0 transition-opacity group-focus-within/trash:opacity-100 group-hover/trash:opacity-100 hover:text-[var(--color-danger)]"
                >
                  <X size={12} />
                </button>
              </div>

              {/*
                Permanent means permanent, so it is the one action here that
                asks. Inline rather than a dialog: the row being destroyed
                stays visible next to the question.
              */}
              {confirming === item.id && (
                <div className="flex items-center gap-1 px-2 pb-1.5">
                  <span className="flex-1 text-[13px] text-[var(--color-danger)]">
                    Delete for good?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onPurge(item.id)
                      setConfirming(null)
                    }}
                    className="rounded bg-[var(--color-danger)] px-2 py-1 text-[13px] font-medium text-white"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="rounded px-2 py-1 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-paper)]"
                  >
                    Keep
                  </button>
                </div>
              )}
            </div>
          ))}

          {docs.length > 1 && (
            <button
              type="button"
              onClick={() => {
                if (confirming === 'all') {
                  onEmpty()
                  setConfirming(null)
                } else {
                  setConfirming('all')
                }
              }}
              className={`mt-1 w-full rounded-md px-2 py-1.5 text-[13px] ${
                confirming === 'all'
                  ? 'bg-[var(--color-danger)] font-medium text-white'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-hover)]'
              }`}
            >
              {confirming === 'all' ? 'Really empty the trash?' : 'Empty trash'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
