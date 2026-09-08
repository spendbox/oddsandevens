'use client'

import { useEffect, useRef, useState } from 'react'
import { TILE_COUNT } from '@/lib/game'
import { naira } from '@/lib/money'

/**
 * The grid, playing a pattern to itself.
 *
 * This is what somebody is being asked to do, shown rather than described. It
 * replaces an illustration of a treasure box, which was decoration: pretty, and
 * about nothing that happens in the game.
 *
 * It plays a real pattern — four flashes, then a pause, then another — at a
 * gentler pace than level 1, because the job here is to be legible from across
 * a room, not to intimidate. Nothing is tappable and nothing is sent anywhere.
 */
export function TileReel({
  amount,
  dim = false,
  className,
}: {
  /** Shown under the grid. Omit to draw the grid alone. */
  amount?: number
  /** A beaten box: keep the grid but drain the colour out of it. */
  dim?: boolean
  className?: string
}) {
  const [lit, setLit] = useState<number | null>(null)
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])

  useEffect(() => {
    const later = (fn: () => void, ms: number) => {
      timers.current.push(setTimeout(fn, ms))
    }

    /** A short run of tiles, never the same one twice in a row. */
    const nextPattern = () => {
      const pattern: number[] = []
      while (pattern.length < 4 + Math.floor(Math.random() * 2)) {
        const tile = Math.floor(Math.random() * TILE_COUNT)
        if (pattern.at(-1) === tile) continue
        pattern.push(tile)
      }
      return pattern
    }

    const run = () => {
      for (const timer of timers.current) clearTimeout(timer)
      timers.current = []

      const pattern = nextPattern()
      let elapsed = 0

      for (const tile of pattern) {
        later(() => setLit(tile), elapsed)
        later(() => setLit(null), elapsed + 460)
        elapsed += 640
      }

      // A beat of darkness between runs, so it reads as separate patterns
      // rather than one endless twinkle.
      later(run, elapsed + 900)
    }

    run()
    return () => {
      for (const timer of timers.current) clearTimeout(timer)
      timers.current = []
    }
  }, [])

  return (
    <div className={className}>
      <div className="relative mx-auto w-full max-w-[15rem]">
        <div
          aria-hidden
          className={
            'absolute inset-4 -z-10 rounded-full blur-3xl ' +
            (dim ? 'bg-white/5' : 'animate-pulse-glow bg-violet/40')
          }
        />

        <div
          className="grid aspect-square grid-cols-3 gap-2 rounded-3xl bg-black/35 p-2 ring-2 ring-violet/25"
          role="img"
          aria-label="A three by three grid lighting up in a pattern"
        >
          {Array.from({ length: TILE_COUNT }, (_, tile) => (
            <div
              key={tile}
              className={
                'rounded-2xl ring-1 ring-inset transition-[background-color,box-shadow,transform] duration-150 ' +
                (lit === tile && !dim
                  ? 'scale-[1.05] bg-linear-to-br from-cyan to-violet ring-white/50 shadow-[0_0_26px_5px_rgb(34_211_238/0.45)]'
                  : 'bg-white/6 ring-white/10')
              }
            />
          ))}
        </div>
      </div>

      {amount !== undefined ? (
        <p className="prize tabular mt-5 text-center text-4xl font-bold sm:text-5xl">
          {naira(amount)}
        </p>
      ) : null}
    </div>
  )
}
