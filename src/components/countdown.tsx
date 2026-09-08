'use client'

import { useEffect, useState } from 'react'

/**
 * Three, two, one.
 *
 * The clock does not run during this and neither does the pattern — it exists
 * so nobody's first flash arrives while their thumb is still travelling from
 * the start button. Every level gets one, including a replay, because the
 * moment after a miss is exactly when somebody is least ready.
 *
 * Counts down over `TICK_MS` per number and then calls `onDone` once. The
 * caller decides what happens next; this component only handles the numbers.
 */
const TICK_MS = 800

export function Countdown({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState(3)

  useEffect(() => {
    if (count === 0) {
      onDone()
      return
    }

    const timer = setTimeout(() => setCount((n) => n - 1), TICK_MS)
    return () => clearTimeout(timer)
    // onDone is recreated on every render of the parent; depending on it would
    // restart the countdown mid-count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

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
