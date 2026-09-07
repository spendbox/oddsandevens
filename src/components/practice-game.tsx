'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Grid, type GridMood } from './grid'
import { Button, ButtonLink, Card, Pill } from './ui'
import { answerMsFor, flashMsFor, gapMsFor, makePattern, stepsFor } from '@/lib/game'

/**
 * The example run: the real game, with nothing at stake.
 *
 * Somebody who has never seen this cannot tell from a description how fast
 * "620ms" is, or what nine flashes feels like. So they get to play it — three
 * levels, no coin, no box, no prize. It ends by pointing at the real thing.
 *
 * Unlike the paid game, everything here happens in the browser: the patterns
 * are generated locally and nothing is sent anywhere. There is no result worth
 * cheating for, so there is nothing for a server to referee. That is precisely
 * why practice can be free and instant.
 */
const PRACTICE_LEVELS = 3

type Phase = 'ready' | 'watch' | 'tap' | 'right' | 'wrong' | 'done'

export function PracticeGame({ boxCode, canPlay }: { boxCode: string; canPlay: boolean }) {
  const [level, setLevel] = useState(1)
  const [phase, setPhase] = useState<Phase>('ready')
  const [pattern, setPattern] = useState<number[]>([])
  const [lit, setLit] = useState<number | null>(null)
  const [pressed, setPressed] = useState<number | null>(null)
  const [taps, setTaps] = useState<number[]>([])
  const [msLeft, setMsLeft] = useState(0)

  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const clearTimers = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer)
    timers.current = []
  }, [])
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms))
  }, [])
  useEffect(() => clearTimers, [clearTimers])

  const start = useCallback(() => {
    clearTimers()
    const next = makePattern(level)
    const flashMs = flashMsFor(level)
    const gapMs = gapMsFor(level)

    setPattern(next)
    setTaps([])
    setLit(null)
    setPhase('watch')

    let elapsed = 0
    next.forEach((tile) => {
      later(() => setLit(tile), elapsed)
      later(() => setLit(null), elapsed + flashMs)
      elapsed += flashMs + gapMs
    })

    later(() => {
      setMsLeft(answerMsFor(level))
      setPhase('tap')
    }, elapsed)
  }, [clearTimers, later, level])

  // The countdown, once it is the player's turn.
  const tapsRef = useRef<number[]>([])
  useEffect(() => {
    tapsRef.current = taps
  }, [taps])

  useEffect(() => {
    if (phase !== 'tap') return

    const endsAt = Date.now() + msLeft
    const tick = setInterval(() => {
      const left = endsAt - Date.now()
      if (left <= 0) {
        clearInterval(tick)
        setMsLeft(0)
        setPhase('wrong')
        return
      }
      setMsLeft(left)
    }, 60)

    return () => clearInterval(tick)
    // msLeft seeds this clock once, when the phase turns to 'tap'.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const onTap = (tile: number) => {
    if (phase !== 'tap') return

    setPressed(tile)
    later(() => setPressed(null), 120)

    const next = [...taps, tile]
    setTaps(next)

    // Wrong the moment it is wrong, rather than at the end of the sequence.
    if (next[next.length - 1] !== pattern[next.length - 1]) {
      clearTimers()
      setPhase('wrong')
      return
    }

    if (next.length === pattern.length) {
      clearTimers()
      setPhase(level >= PRACTICE_LEVELS ? 'done' : 'right')
    }
  }

  const nextLevel = () => {
    setLevel((current) => current + 1)
    setPhase('ready')
  }

  const retry = () => {
    setPhase('ready')
  }

  const mood: GridMood =
    phase === 'watch' ? 'showing'
    : phase === 'tap' ? 'input'
    : phase === 'right' || phase === 'done' ? 'right'
    : phase === 'wrong' ? 'wrong'
    : 'idle'

  const steps = stepsFor(level)
  const answerMs = answerMsFor(level)
  const fraction = phase === 'tap' ? Math.max(0, Math.min(1, msLeft / answerMs)) : 1

  if (phase === 'done') {
    return (
      <div className="animate-rise text-center">
        <p className="text-7xl" aria-hidden>
          🎓
        </p>
        <h2 className="mt-4 text-3xl font-bold tracking-tight">Now you know how it works</h2>
        <p className="mt-3 text-mist">
          That was levels 1 to {PRACTICE_LEVELS}. The real box goes to 10, and the last one
          is thirteen flashes in five seconds.
        </p>

        <div className="mt-8 grid gap-3">
          <ButtonLink href={`/b/${boxCode}`} tone="gold" size="lg">
            {canPlay ? 'Play the real box · 1 coin' : 'Back to the box'}
          </ButtonLink>
          <Button
            tone="ghost"
            size="lg"
            onClick={() => {
              setLevel(1)
              setPhase('ready')
            }}
          >
            Practise again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="no-select">
      <div className="mb-5 flex items-center gap-3">
        <Pill tone="cyan">Practice · free</Pill>
        <span className="ml-auto text-sm text-dusk">
          Level {level} of {PRACTICE_LEVELS}
        </span>
      </div>

      <div className="mb-5 flex h-[7.5rem] flex-col justify-center text-center">
        <p className="text-sm font-semibold tracking-[0.2em] text-dusk uppercase">
          {phase === 'right' ? 'Nice' : phase === 'wrong' ? 'Not quite' : `Level ${level}`}
        </p>

        {phase === 'tap' ? (
          <p className="tabular mt-1 text-5xl font-bold">
            {(msLeft / 1000).toFixed(1)}
            <span className="text-2xl text-dusk">s</span>
          </p>
        ) : (
          <p className="mt-1 text-2xl font-bold text-mist">
            {phase === 'watch'
              ? 'Watch…'
              : phase === 'right'
                ? 'Perfect ✓'
                : phase === 'wrong'
                  ? 'Try that again'
                  : `${steps} flashes`}
          </p>
        )}

        <div className="mx-auto mt-3 h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
          <div
            className={
              'h-full rounded-full transition-[width] duration-75 ease-linear ' +
              (fraction > 0.4 ? 'bg-lime' : fraction > 0.18 ? 'bg-gold' : 'bg-rose')
            }
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
      </div>

      <Grid lit={lit} mood={mood} disabled={phase !== 'tap'} pressed={pressed} onTap={onTap} />

      <div className="mt-5 flex items-center justify-center gap-1.5" aria-hidden>
        {Array.from({ length: steps }, (_, index) => (
          <span
            key={index}
            className={
              'size-2 rounded-full transition ' +
              (index < taps.length ? 'bg-cyan' : 'bg-white/12')
            }
          />
        ))}
      </div>

      <div className="mt-6 min-h-[13rem]">
        {phase === 'ready' || phase === 'right' || phase === 'wrong' ? (
          <Card className="text-center">
            <p className="text-sm leading-relaxed text-mist">
              {phase === 'wrong'
                ? 'That is all a miss costs in practice. In a real box you would have one free replay.'
                : phase === 'right'
                  ? `Level ${level} down. Level ${level + 1} is one flash longer and a little quicker.`
                  : `${steps} tiles will flash. Tap them back in the same order. The clock only starts when the last flash goes out.`}
            </p>

            <Button
              onClick={phase === 'right' ? nextLevel : phase === 'wrong' ? retry : start}
              tone="gold"
              size="lg"
              className="mt-4 w-full"
            >
              {phase === 'right'
                ? `Try level ${level + 1}`
                : phase === 'wrong'
                  ? 'Go again'
                  : `Start level ${level}`}
            </Button>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
