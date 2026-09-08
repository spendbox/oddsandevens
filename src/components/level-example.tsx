'use client'

import { useEffect, useState } from 'react'
import { TILE_COUNT, answerMsFor, flashMsFor, makePattern, stepsFor } from '@/lib/game'

/**
 * One level, playing itself.
 *
 * "13 flashes in 5 seconds" is a fact nobody can feel. Watching level 10 go
 * past at its real speed is the same fact, understood. So the numbers come with
 * the thing they describe, at the pace it actually runs.
 */
export function LevelExample({ level }: { level: number }) {
  const [lit, setLit] = useState<number | null>(null)

  useEffect(() => {
    let timers: Array<ReturnType<typeof setTimeout>> = []

    const run = () => {
      for (const timer of timers) clearTimeout(timer)
      timers = []

      const pattern = makePattern(level)
      const flashMs = flashMsFor(level)
      const gapMs = Math.round(flashMs * 0.32)
      let elapsed = 0

      for (const tile of pattern) {
        timers.push(setTimeout(() => setLit(tile), elapsed))
        timers.push(setTimeout(() => setLit(null), elapsed + flashMs))
        elapsed += flashMs + gapMs
      }

      // A clear gap before the next run, so the loop reads as repetition
      // rather than one continuous blur.
      timers.push(setTimeout(run, elapsed + 1400))
    }

    run()
    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
  }, [level])

  return (
    <div className="flex items-center gap-4">
      <div
        className="grid w-20 shrink-0 grid-cols-3 gap-1 rounded-xl bg-black/40 p-1 ring-1 ring-inset ring-white/10"
        role="img"
        aria-label={`An example of level ${level}`}
      >
        {Array.from({ length: TILE_COUNT }, (_, tile) => (
          <div
            key={tile}
            className={
              'aspect-square rounded-md transition-colors duration-100 ' +
              (lit === tile
                ? 'bg-linear-to-br from-cyan to-violet shadow-[0_0_10px_2px_rgb(34_211_238/0.5)]'
                : 'bg-white/8')
            }
          />
        ))}
      </div>

      <div className="min-w-0">
        <p className="font-semibold">Level {level}</p>
        <p className="tabular text-sm text-mist">
          {stepsFor(level)} flashes ·{' '}
          <span className="text-chalk">{answerMsFor(level) / 1000}s</span> to tap them back
        </p>
        <p className="mt-0.5 text-xs text-dusk">
          Each tile lights for {flashMsFor(level)}ms
        </p>
      </div>
    </div>
  )
}
