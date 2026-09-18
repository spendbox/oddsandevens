'use client'

import { Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'

/**
 * A row that is dragged to the left to get rid of it.
 *
 * ## Why this is its own file
 *
 * Because the notes list and the Actions tab both do it, and a gesture that
 * behaves differently in two places in the same app is a gesture nobody
 * trusts. The distance, the slop, the word that slides in underneath and the
 * three ways it can go wrong are written once here.
 *
 * `note-row.tsx` still has its own copy: it is welded into a row that also
 * opens a note, favourites it, and paints a search highlight, and pulling that
 * apart is a change to the one list this app is built around. This is the
 * shared version for everything that came after it.
 *
 * ## The three things that go wrong
 *
 * 1. **Capturing on pointerdown kills every button inside.** It retargets the
 *    whole gesture, the following `click` included, to the capturing element.
 *    The capture happens only once a drag is real.
 * 2. **A drag down the page belongs to the scroller.** If the first movement
 *    is more vertical than horizontal, this lets go of it entirely.
 * 3. **A drag is not a tap.** The click that completes the gesture still
 *    arrives, so it is swallowed — otherwise every swipe also presses whatever
 *    was under the thumb.
 */

/** How far a row has to be dragged before letting go removes it. */
const REMOVE_AT = 96
/** How far a drag has to move before it is a drag rather than a tap. */
const SLOP = 10

export default function SwipeAway({
  onAway,
  /** What the word under the row says will happen. */
  label = 'Delete',
  className,
  children,
}: {
  onAway: () => void
  label?: string
  className?: string
  children: React.ReactNode
}) {
  const [shift, setShift] = useState(0)
  const drag = useRef<{ id: number; x: number; y: number; on: boolean } | null>(null)
  const dragged = useRef(false)

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, on: false }
    dragged.current = false
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const start = drag.current
    if (!start || start.id !== event.pointerId) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y

    if (!start.on) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null
        return
      }
      start.on = true
      dragged.current = true
      // A half-selected row sliding sideways looks like the app has come apart.
      window.getSelection()?.removeAllRanges()
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    }
    // Only to the left. A row that does not move to the right cannot be
    // mistaken for one with something waiting over there.
    setShift(Math.min(0, dx))
  }

  const finish = (event: React.PointerEvent) => {
    const start = drag.current
    drag.current = null
    if (!start?.on) return
    const far = shift <= -REMOVE_AT
    setShift(0)
    if (far) onAway()
    setTimeout(() => {
      dragged.current = false
    }, 0)
    if ((event.currentTarget as HTMLElement).hasPointerCapture?.(event.pointerId)) {
      ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      {/*
        What is underneath, sliding into view as the row comes off. It is the
        whole reason a swipe is safe: nobody removes something by accident when
        the word has been arriving under their thumb for half a second.
      */}
      {shift < 0 && (
        <span
          aria-hidden
          className={`absolute inset-y-0 right-0 flex items-center gap-1.5 pr-4 text-[13px] font-medium ${
            shift <= -REMOVE_AT ? 'text-white' : 'text-[var(--color-danger)]'
          }`}
        >
          <Trash2 size={15} />
          {label}
        </span>
      )}
      {shift <= -REMOVE_AT && (
        <span aria-hidden className="absolute inset-0 -z-10 bg-[var(--color-danger)]" />
      )}

      <div
        style={{ transform: shift ? `translateX(${shift}px)` : undefined }}
        /*
          `touch-pan-y` hands the browser the vertical axis and keeps the
          horizontal one: without it a phone scrolls the list *and* drags the
          row, and neither gesture does what it looks like.
        */
        className={`relative touch-pan-y bg-[var(--color-paper)] ${
          shift ? 'select-none' : 'transition-transform'
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={(event) => {
          // A row that was dragged was not tapped.
          if (dragged.current) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
