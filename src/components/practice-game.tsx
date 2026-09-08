'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Grid, type GridMood } from './grid'
import { GraduationCap, RotateCcw, Zap } from 'lucide-react'
import { Button, ButtonLink, Card, Pill } from './ui'
import { Mascot } from './mascot'
import { Countdown } from './countdown'
import { usePatternPlayer } from './use-pattern-player'
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

type Phase = 'ready' | 'counting' | 'watch' | 'tap' | 'right' | 'wrong' | 'done'

export function PracticeGame({ boxCode, canPlay }: { boxCode: string; canPlay: boolean }) {
  const [level, setLevel] = useState(1)
  const [phase, setPhase] = useState<Phase>('ready')
  const [pattern, setPattern] = useState<number[]>([])
  const [pressed, setPressed] = useState<number | null>(null)
  const [taps, setTaps] = useState<number[]>([])
  const [msLeft, setMsLeft] = useState(0)

  // The same player the real game uses, so practice runs at the same speed the
  // paid version does. A practice level that drifts long is a practice level
  // that teaches the wrong rhythm.
  const { lit, play: playPattern, stop: stopPattern } = usePatternPlayer()
  /** When the clock on screen reaches zero, as a clock time. */
  const endsAt = useRef(0)

  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const clearTimers = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer)
    timers.current = []
  }, [])
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms))
  }, [])
  useEffect(() => clearTimers, [clearTimers])

  /** Draw the pattern and start counting in. Nothing is shown yet. */
  const start = useCallback(() => {
    clearTimers()
    stopPattern()
    setPattern(makePattern(level))
    setTaps([])
    setPressed(null)
    setPhase('counting')
  }, [clearTimers, level, stopPattern])

  /** Play the pattern out, once the count has reached zero. */
  const showPattern = useCallback(
    (next: number[]) => {
      clearTimers()
      setPhase('watch')

      playPattern(next, flashMsFor(level), gapMsFor(level), () => {
        endsAt.current = Date.now() + answerMsFor(level)
        setMsLeft(answerMsFor(level))
        setPhase('tap')
      })
    },
    [clearTimers, level, playPattern],
  )

  // The countdown, once it is the player's turn.
  const tapsRef = useRef<number[]>([])
  useEffect(() => {
    tapsRef.current = taps
  }, [taps])

  useEffect(() => {
    if (phase !== 'tap') return

    const until = endsAt.current
    const tick = setInterval(() => {
      const left = until - Date.now()
      if (left <= 0) {
        clearInterval(tick)
        setMsLeft(0)
        setPressed(null)
        setPhase('wrong')
        return
      }
      setMsLeft(left)
    }, 60)

    return () => clearInterval(tick)
    // The clock runs off endsAt, an absolute moment fixed when the turn began,
    // so this only ever needs starting and stopping with the phase.
  }, [phase])

  const onTap = (tile: number) => {
    if (phase !== 'tap') return

    setPressed(tile)
    later(() => setPressed(null), 120)

    // Added to whatever is already recorded rather than to `taps` as this
    // render saw it, so that two taps landing before React has committed the
    // first cannot lose one. Same as the real game.
    setTaps((current) => [...current, tile])
  }

  /**
   * Judge the taps so far: wrong the moment they are wrong, rather than at the
   * end of the sequence, and right when the pattern is complete.
   *
   * Off the committed taps and on its own tick, for the same reasons as the
   * real game.
   */
  useEffect(() => {
    if (phase !== 'tap' || taps.length === 0) return

    const wrong = taps.some((tap, index) => tap !== pattern[index])
    if (!wrong && taps.length < pattern.length) return

    const settle = setTimeout(() => {
      clearTimers()
      // clearTimers has just cancelled the pending un-press from the last tap,
      // so the tile has to be released here or it stays lit into the next
      // level — where it looks like the game giving away the first tile of a
      // pattern it has not drawn yet. Same reason the dots are emptied.
      setPressed(null)
      setTaps([])
      setPhase(wrong ? 'wrong' : level >= PRACTICE_LEVELS ? 'done' : 'right')
    }, 0)

    return () => clearTimeout(settle)
  }, [clearTimers, level, pattern, phase, taps])

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
        <Mascot mood="excited" size={140} className="mx-auto" />
        <h2 className="mt-4 text-3xl font-bold tracking-tight">Now you know how it works</h2>
        <p className="mt-3 text-mist">
          That was levels 1 to {PRACTICE_LEVELS}. The real box goes to 10, and the last one
          is thirteen flashes in five seconds.
        </p>

        <div className="mt-8 grid gap-3">
          <ButtonLink href={`/b/${boxCode}`} tone="gold" size="lg">
            <Zap size={18} /> {canPlay ? 'Play the real box · 1 coin' : 'Back to the box'}
          </ButtonLink>
          <Button
            tone="ghost"
            size="lg"
            onClick={() => {
              setLevel(1)
              setPhase('ready')
            }}
          >
            <RotateCcw size={17} /> Practise again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="no-select">
      <div className="mb-5 flex items-center gap-3">
        <Pill tone="cyan">
          <GraduationCap size={13} /> Practice · free
        </Pill>
        <span className="ml-auto text-sm text-dusk">
          Level {level} of {PRACTICE_LEVELS}
        </span>
      </div>

      <div className="mb-5 flex h-[7.5rem] flex-col justify-center text-center">
        <p className="text-sm font-semibold tracking-[0.2em] text-dusk uppercase">
          {phase === 'right'
            ? 'Nice'
            : phase === 'wrong'
              ? 'Not quite'
              : `Level ${level}`}
        </p>

        {phase === 'tap' ? (
          <p className="tabular mt-1 text-5xl font-bold">
            {(msLeft / 1000).toFixed(1)}
            <span className="text-2xl text-dusk">s</span>
          </p>
        ) : (
          <p className="mt-1 text-2xl font-bold text-mist">
            {phase === 'counting'
              ? 'Get ready'
              : phase === 'watch'
                ? 'Watch…'
                : phase === 'right'
                  ? 'Perfect'
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

      <div className="relative">
        <Grid lit={lit} mood={mood} disabled={phase !== 'tap'} pressed={pressed} onTap={onTap} />

        {phase === 'counting' ? <Countdown onDone={() => showPattern(pattern)} /> : null}
      </div>

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
