'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Plays a pattern out on the grid, on one clock.
 *
 * Every flash edge used to be its own setTimeout — two per flash, twenty-seven
 * of them at level 10 — and each one woke React up to re-render the grid. A
 * browser fires a timer no *earlier* than its due time and never earlier, so
 * every late frame on a busy phone pushed the rest of the pattern back, and the
 * whole run finished later than `showMsFor()` promised. That overrun came
 * straight out of the player's answer time, because the server had already
 * written down a deadline assuming the pattern would take exactly showMs. It is
 * the difference between a clock the server can predict and one it cannot, and
 * it is why people were being told they were out of time with seconds on the
 * screen.
 *
 * So playback is one requestAnimationFrame loop reading the wall clock instead.
 * Which tile is lit is a function of how long the pattern has been running, not
 * of how many timers have fired: a slow frame drops a frame, it does not move
 * the finish line. The last flash goes out at showMs give or take a frame,
 * whatever the device is doing, which is exactly what the server budgeted for.
 *
 * It owns `lit` as well as the loop, so stopping playback and clearing the grid
 * cannot come apart — a tile left lit into the next level looks like the game
 * giving away a pattern it has not drawn yet.
 */
export function usePatternPlayer() {
  const [lit, setLit] = useState<number | null>(null)
  const frame = useRef(0)
  // What is on screen right now, read inside the loop. Going through state
  // there would re-render on all sixty frames a second instead of on the dozen
  // that actually change something.
  const showing = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current)
    frame.current = 0
    showing.current = null
    setLit(null)
  }, [])

  useEffect(() => stop, [stop])

  /**
   * Run `pattern` and call `onDone` when the last flash is out.
   *
   * `onDone` fires from inside the frame that crosses the finish line, so the
   * player's turn starts on the same clock the flashes were drawn on.
   */
  const play = useCallback(
    (pattern: number[], flashMs: number, gapMs: number, onDone: () => void) => {
      if (frame.current) cancelAnimationFrame(frame.current)
      showing.current = null
      setLit(null)

      const step = flashMs + gapMs
      const total = pattern.length * step
      const startedAt = performance.now()

      const tick = () => {
        const elapsed = performance.now() - startedAt

        if (elapsed >= total) {
          frame.current = 0
          showing.current = null
          setLit(null)
          onDone()
          return
        }

        const index = Math.floor(elapsed / step)
        // Lit for the first flashMs of the step, dark for the gap after it, so
        // the same tile twice running reads as two flashes rather than one long
        // one.
        const next = elapsed - index * step < flashMs ? pattern[index] : null

        if (next !== showing.current) {
          showing.current = next
          setLit(next)
        }

        frame.current = requestAnimationFrame(tick)
      }

      frame.current = requestAnimationFrame(tick)
    },
    [],
  )

  return { lit, play, stop }
}
