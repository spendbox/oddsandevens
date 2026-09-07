'use client'

import { useEffect, useState } from 'react'
import { Grid } from './grid'

/**
 * The grid on the front page, playing itself.
 *
 * It exists to answer "what is this?" without a paragraph. It never takes a
 * tap, never talks to the server, and deliberately runs slower than level 1 —
 * it is a demonstration, not a taste of the difficulty.
 */
const DEMO = [4, 0, 8, 2, 6, 1, 7, 3]

export function DemoGrid() {
  const [step, setStep] = useState(-1)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    const advance = (next: number) => {
      setStep(next)
      const isGap = next % 2 === 1
      const atEnd = next >= DEMO.length * 2
      timer = setTimeout(() => advance(atEnd ? 0 : next + 1), atEnd ? 900 : isGap ? 160 : 460)
    }

    timer = setTimeout(() => advance(0), 500)
    return () => clearTimeout(timer)
  }, [])

  // Even steps light a tile, odd steps are the dark beat between them.
  const lit = step >= 0 && step % 2 === 0 ? DEMO[step / 2] : null

  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 animate-drift rounded-full bg-violet/25 blur-3xl"
      />
      <Grid lit={lit} mood="showing" disabled pressed={null} onTap={() => {}} />
    </div>
  )
}
