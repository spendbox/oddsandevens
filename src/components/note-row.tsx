'use client'

import { Star, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { docLabel, docOpening } from '@/lib/blocks'
import { blockText, type Doc } from '@/lib/types'
import { stamp } from '@/lib/when'
import { KindTile } from './note-kind'

/**
 * One note in a list: what it is, what it is called, how it starts, and when.
 *
 * ## Why a row and not a card
 *
 * Because a list of notes is read down the left edge. Cards in a grid make the
 * eye travel in two directions and give every note the same weight regardless
 * of what is in it; a row lets the title, the opening and the time line up in
 * three columns that the eye can run down separately. It is what every mail
 * client, every messaging app and every notes app has converged on, and they
 * did not converge by accident.
 *
 * ## Two lines of the note, not one
 *
 * One line is a label; two is enough to recognise a note you cannot remember
 * naming — which is most of them, because the caret starts in the body and
 * plenty of notes never get a title at all. Three would make the list scroll
 * twice as far for a third as much recognition.
 *
 * Separated by a hairline rather than sitting in a box each: forty boxes is
 * forty borders, and the page stops looking like a list of writing.
 *
 * ## Swiping it away
 *
 * Drag the row to the left and it goes to the trash — the gesture every list
 * on a phone has, and the one people try first. It is a pointer gesture rather
 * than a touch one, so a trackpad does the same thing; and it is never the
 * only way, because a gesture nobody discovers is a feature nobody has. The
 * same delete is a button on the row, and it is in the note's own ⋯.
 */

/** How far a row has to be dragged before letting go deletes it. */
const DELETE_AT = 96
/** How far a drag has to move before it is a drag rather than a tap. */
const SLOP = 10

export default function NoteRow({
  doc,
  onOpen,
  onFavorite,
  onDelete,
  now,
  /** Painted over the title and the opening, for a search result. */
  highlight,
}: {
  doc: Doc
  onOpen: (id: string) => void
  onFavorite?: (id: string, favorite: boolean) => void
  /** Absent in search results, where a swipe would be a surprise. */
  onDelete?: (id: string) => void
  now?: number
  highlight?: (text: string) => React.ReactNode
}) {
  const starred = !!doc.favoritedAt
  const label = docLabel(doc)
  const opening = docOpening(doc)
  const empty = doc.blocks.every((block) => !blockText(block).trim())
  const mark = highlight ?? ((text: string) => text)

  /** How far this row is currently dragged. Zero except during a swipe. */
  const [shift, setShift] = useState(0)
  const drag = useRef<{ id: number; x: number; y: number; on: boolean } | null>(null)
  /** Set by a real drag, so the click that follows it does not open the note. */
  const dragged = useRef(false)

  const onPointerDown = (event: React.PointerEvent) => {
    if (!onDelete || event.button !== 0) return
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, on: false }
    dragged.current = false
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const start = drag.current
    if (!start || start.id !== event.pointerId) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y

    if (!start.on) {
      // Not a swipe until it has moved, and not a swipe at all if it is moving
      // down the page — scrolling a list must never drag a row sideways.
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null
        return
      }
      start.on = true
      dragged.current = true
      /*
        A drag across text is a text selection unless something says
        otherwise, and a half-selected row sliding sideways under a thumb
        looks like the app has come apart. The selection is cleared once, here,
        and the row stops being selectable for the rest of the gesture.
      */
      window.getSelection()?.removeAllRanges()
      /*
        Captured here and not on pointerdown. Capturing on pointerdown
        retargets the whole gesture — including the click that completes a tap
        — to this element, which silently kills every button inside it.
      */
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    }
    // Only to the left: dragging a row to the right does nothing, so it does
    // not move and cannot be mistaken for an action that has one.
    setShift(Math.min(0, dx))
  }

  const finish = (event: React.PointerEvent) => {
    const start = drag.current
    drag.current = null
    if (!start?.on) return
    const far = shift <= -DELETE_AT
    setShift(0)
    if (far && onDelete) onDelete(doc.id)
    // The click that completes this gesture is swallowed below; this only
    // clears the flag once the browser has had it.
    setTimeout(() => {
      dragged.current = false
    }, 0)
    if ((event.currentTarget as HTMLElement).hasPointerCapture?.(event.pointerId)) {
      ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    }
  }

  return (
    <li className="group/row relative overflow-hidden border-b border-[var(--color-line)] last:border-b-0">
      {/*
        What is underneath the row, revealed as it is dragged off. It says what
        letting go will do, which is the whole reason a swipe is safe: nobody
        deletes a note by accident when the word "Delete" has been sliding into
        view under their thumb for half a second.
      */}
      {onDelete && shift < 0 && (
        <span
          aria-hidden
          className={`absolute inset-y-0 right-0 flex items-center gap-1.5 pr-4 text-[13px] font-medium ${
            shift <= -DELETE_AT ? 'text-white' : 'text-[var(--color-danger)]'
          }`}
        >
          <Trash2 size={15} />
          Delete
        </span>
      )}
      {onDelete && shift <= -DELETE_AT && (
        <span aria-hidden className="absolute inset-0 -z-10 bg-[var(--color-danger)]" />
      )}

      <div
        style={{ transform: shift ? `translateX(${shift}px)` : undefined }}
        /*
          `touch-pan-y` gives the browser the vertical axis and keeps the
          horizontal one for the swipe: without it a phone scrolls the list
          *and* drags the row, and neither gesture does what it looks like.
        */
        className={`relative touch-pan-y bg-[var(--color-paper)] ${
          shift ? 'select-none' : 'transition-transform'
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <button
          type="button"
          onClick={(event) => {
            // A row that was dragged was not tapped.
            if (dragged.current) {
              event.preventDefault()
              return
            }
            onOpen(doc.id)
          }}
          className="flex w-full items-start gap-3 px-1 py-3.5 text-left hover:bg-[var(--color-hover)]"
        >
          <KindTile doc={doc} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-3">
              <span className="pad-serif min-w-0 flex-1 truncate text-[16px] font-semibold">
                {mark(label)}
              </span>
              {/*
                The time is the last thing on the line and never moves, so the
                column of them can be read on its own. It does not shrink: a
                wrapped "Yesterday" is the one thing on this row that would
                make it two rows tall.
              */}
              <span className="shrink-0 text-[12px] text-[var(--color-faint)] tabular-nums">
                {stamp(doc.updatedAt, now)}
              </span>
            </span>
            {/*
              The rest of the note, under its name.

              A one-line note *is* its name, so there is nothing left to show
              and the row is a single line — which is correct, and much better
              than printing the same sentence twice or saying "nothing written
              yet" about a note that plainly has something written in it. That
              phrase is kept for the note that genuinely has nothing in it.
            */}
            {(opening || empty) && (
              <span className="pad-serif mt-0.5 line-clamp-2 block pr-14 text-[14px] leading-snug text-[var(--color-muted)]">
                {opening ? mark(opening) : 'Nothing written yet.'}
              </span>
            )}
          </span>
        </button>

        {/*
          The two controls a row carries. On a desktop they appear under the
          pointer; on a touch screen they are simply always there, because
          there is no hover on a phone and a control that only exists under a
          pointer is a control a phone does not have.
        */}
        <span className="absolute right-1 bottom-2 flex items-center">
          {onDelete && (
            <button
              type="button"
              aria-label={`Delete ${label}`}
              onClick={() => onDelete(doc.id)}
              className="rounded-md p-2 text-[var(--color-faint)] hover:text-[var(--color-danger)] sm:opacity-0 sm:group-hover/row:opacity-100 sm:focus:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          )}
          {onFavorite && (
            <button
              type="button"
              aria-label={starred ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
              aria-pressed={starred}
              onClick={() => onFavorite(doc.id, !starred)}
              className={`rounded-md p-2 sm:opacity-0 sm:group-hover/row:opacity-100 sm:focus:opacity-100 ${
                starred
                  ? 'text-[var(--color-accent)] sm:opacity-100'
                  : 'text-[var(--color-faint)] hover:text-[var(--color-ink)]'
              }`}
            >
              <Star size={13} fill={starred ? 'currentColor' : 'none'} />
            </button>
          )}
        </span>
      </div>
    </li>
  )
}
