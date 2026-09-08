'use client'

import { useEffect, useRef, useState } from 'react'
import { COUNT_IN_MS, COUNT_IN_TICKS, COUNT_IN_TICK_MS } from '@/lib/game'

/**
 * Three, two, one.
 *
 * The clock does not run during this and neither does the pattern — it exists
 * so nobody's first flash arrives while their thumb is still travelling from
 * the start button. Every level gets one, including a replay, because the
 * moment after a miss is exactly when somebody is least ready.
 *
 * The timings come from src/lib/game.ts rather than living here, because the
 * server budgets for this pause when it sets the deadline. If the two ever
 * disagree, the player loses the difference.
 *
 * Which is why the count is read off one start time rather than run as three
 * chained setTimeouts. A chain can only ever be late: each link fires no
 * earlier than its due time, waits for React to render the new digit, and only
 * then schedules the next — so on a slow phone three ticks took rather more
 * than three times COUNT_IN_TICK_MS, and every millisecond of that came out of
 * the answer window the server had already written down. Anchored to
 * `startedAt`, a late frame shows the right digit late instead of pushing the
 * finish line back, and the count-in lands on COUNT_IN_MS on every device.
 */
export function Countdown({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState(COUNT_IN_TICKS)

  // onDone is a fresh closure on every render of the parent. Held in a ref so
  // the loop below can call the current one without depending on it — a
  // dependency there would restart the count mid-count.
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })

  useEffect(() => {
    const startedAt = performance.now()
    let showing = COUNT_IN_TICKS

    let frame = requestAnimationFrame(function tick() {
      const elapsed = performance.now() - startedAt

      if (elapsed >= COUNT_IN_MS) {
        setCount(0)
        done.current()
        return
      }

      const next = COUNT_IN_TICKS - Math.floor(elapsed / COUNT_IN_TICK_MS)
      if (next !== showing) {
        showing = next
        setCount(next)
      }

      frame = requestAnimationFrame(tick)
    })

    return () => cancelAnimationFrame(frame)
  }, [])

  if (count === 0) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
      role="status"
      aria-live="assertive"
      aria-label={`Starting in ${count}`}
    >
      <span
        key={count}
        className="animate-count-in bg-linear-to-br from-cyan via-violet to-gold bg-clip-text
                   text-[7rem] leading-none font-bold text-transparent
                   drop-shadow-[0_0_40px_rgba(168,85,247,0.55)]"
      >
        {count}
      </span>
    </div>
  )
}
