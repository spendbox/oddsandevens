'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Grid, type GridMood } from '@/components/grid'
import { ChevronLeft, Coins, Play, RefreshCw, RotateCcw, Trophy, Zap } from 'lucide-react'
import { Button, ButtonLink, Card, Pill } from '@/components/ui'
import { Mascot } from '@/components/mascot'
import { Countdown } from '@/components/countdown'
import { LEVELS, answerMsFor, stepsFor } from '@/lib/game'
import { COINS_PER_PLAY, COINS_PER_RETRY } from '@/lib/money'
import { naira } from '@/lib/money'
import type { Box } from '@/lib/types'

/** What the server sends back after every call. Mirrors GameState in lib/play. */
type Round = {
  pattern: number[]
  flashMs: number
  gapMs: number
  answerMs: number
  msRemaining: number
}

type GameState = {
  attemptId: string
  status: 'playing' | 'won' | 'failed'
  level: number
  levelsCleared: number
  replaysLeft: number
  awaitingReplay: boolean
  /** Coins in the wallet, so the miss screen knows what it can offer. */
  coins?: number
  round?: Round
  message?: string
}

/**
 * Where the screen is in the loop:
 *
 *   ready  -> the level card, clock stopped. Nothing is running until they tap.
 *   counting -> 3, 2, 1. The pattern is already in hand but is not shown yet,
 *               so nobody's first flash lands while their thumb is still
 *               travelling from the start button.
 *   watch  -> the pattern plays. Still no clock; watching is free.
 *   tap    -> their turn, and now the clock runs.
 *   judged -> a beat of feedback, then either the next level or the miss card.
 *
 * The clock stopping between levels is the rule of the game, not a nicety: a
 * player must never lose a second to a screen they were reading.
 */
type Phase = 'ready' | 'counting' | 'watch' | 'tap' | 'sending' | 'cleared' | 'decide' | 'over'

/** How long the "level cleared" flash sits on screen before the next card. */
const CLEARED_MS = 1500

/**
 * What the screen shouts when a level goes down.
 *
 * Indexed by the level just cleared, so the praise escalates with the climb —
 * clearing level 9 is a genuinely rare thing and should not be met with the
 * same word as clearing level 1.
 */
const CHEERS = [
  { word: 'Nice!', note: 'One down.' },
  { word: 'Well done!', note: 'Two in a row.' },
  { word: 'Sharp!', note: 'Three clean.' },
  { word: 'Excellent!', note: 'Most people stop around here.' },
  { word: 'Brilliant!', note: 'Halfway to the box.' },
  { word: 'On fire!', note: 'Six down, four to go.' },
  { word: 'Incredible!', note: 'This is the hard half now.' },
  { word: 'Unreal!', note: 'Eight. Almost nobody gets here.' },
  { word: 'One more!', note: 'Level 10 is all that is left.' },
]

export function Game({ initial, box }: { initial: GameState; box: Box }) {
  const router = useRouter()

  const [state, setState] = useState<GameState>(initial)
  const [phase, setPhase] = useState<Phase>(
    initial.status !== 'playing' ? 'over' : initial.awaitingReplay ? 'decide' : 'ready',
  )
  const [round, setRound] = useState<Round | null>(null)
  const [lit, setLit] = useState<number | null>(null)
  const [pressed, setPressed] = useState<number | null>(null)
  const [taps, setTaps] = useState<number[]>([])
  const [msLeft, setMsLeft] = useState(0)

  /**
   * When the server stops accepting this level's answer, as a clock time.
   *
   * Kept as an absolute moment rather than "milliseconds remaining" because a
   * duration goes stale the instant anything takes time — the count-in, a slow
   * render, a reload — and the screen then shows a clock the server disagrees
   * with. Read against Date.now() whenever it matters, so every one of those
   * pauses is accounted for exactly once, by subtraction.
   */
  const deadlineAt = useRef(0)
  /** The level whose cheer is on screen right now. */
  const [justCleared, setJustCleared] = useState(0)

  // Every timer this component starts, so a phase change can cancel all of
  // them at once. A stray flash from a previous level landing on a live round
  // would be a bug the player experiences as the game cheating.
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  // The countdown below closes over the taps as they were when it started, so
  // it reads them from here instead of from state.
  const tapsRef = useRef<number[]>([])
  const clearTimers = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer)
    timers.current = []
  }, [])
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms))
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  /**
   * Talk to the server, and remember when we started asking.
   *
   * `askedAt` is the anchor for the deadline. The server reports how long is
   * left as of the moment it replied, and that reply then spends a network hop
   * getting here — so measuring from when the response lands puts the clock
   * later than the server's by exactly that hop, and the answer going back up
   * spends another. Anchoring to the request instead makes the screen's
   * deadline provably no later than the server's, whatever the connection is
   * doing.
   */
  const post = useCallback(
    async (
      path: string,
      body: object,
    ): Promise<{ state: GameState; askedAt: number } | null> => {
      const askedAt = Date.now()
      try {
        const response = await fetch(`/api/game/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ attemptId: initial.attemptId, ...body }),
        })
        if (!response.ok) return null
        return { state: (await response.json()) as GameState, askedAt }
      } catch {
        return null
      }
    },
    [initial.attemptId],
  )

  /** Play the pattern out, flash by flash, then hand the grid over. */
  const showPattern = useCallback(
    (next: Round) => {
      clearTimers()
      setTaps([])
      setLit(null)
      setPhase('watch')

      let elapsed = 0
      next.pattern.forEach((tile) => {
        later(() => setLit(tile), elapsed)
        later(() => setLit(null), elapsed + next.flashMs)
        elapsed += next.flashMs + next.gapMs
      })

      later(() => {
        // Read the deadline now, at the moment the player's turn actually
        // starts. Whatever the count-in and the pattern took has already come
        // out of it, so this is the real number rather than an estimate made
        // several seconds ago.
        const serverLeft = deadlineAt.current - Date.now()
        setMsLeft(Math.max(0, Math.min(next.answerMs, serverLeft)))
        setPhase('tap')
      }, elapsed)
    },
    [clearTimers, later],
  )

  /**
   * Take a reply that should contain a round, and start counting in.
   *
   * The deadline is anchored to when the request went out, never to now — see
   * the note on post(). Every path that starts a level goes through here so
   * there is one place that can get it wrong, rather than four.
   */
  const startRound = useCallback(
    (result: { state: GameState; askedAt: number }, fallback: Phase) => {
      const next = result.state
      setState(next)

      if (next.status === 'won') {
        router.replace(`/won/${initial.attemptId}`)
        return
      }
      if (next.status !== 'playing') return setPhase('over')
      if (next.awaitingReplay) return setPhase('decide')
      if (!next.round) return setPhase(fallback)

      deadlineAt.current = result.askedAt + next.round.msRemaining
      setRound(next.round)
      setPhase('counting')
    },
    [initial.attemptId, router],
  )

  /** Ask the server to start the level, then show whatever it sends. */
  const beginLevel = useCallback(async () => {
    clearTimers()
    setPhase('sending')

    const result = await post('begin', {})
    if (!result) return setPhase('ready')

    startRound(result, 'ready')
  }, [clearTimers, post, startRound])

  /** Send the taps and act on the verdict. */
  const submit = useCallback(
    async (finalTaps: number[]) => {
      clearTimers()
      // clearTimers has just cancelled the pending un-press from the final tap,
      // so the tile has to be released here or it stays lit through the cheer
      // and into the next level — where it looks like the game giving away the
      // first tile of a pattern that has not been drawn yet.
      setPressed(null)
      setPhase('sending')

      const result = await post('answer', { level: state.level, taps: finalTaps })
      if (!result) return setPhase('decide')
      const next = result.state

      setRound(null)
      setState(next)

      if (next.status === 'won') {
        router.replace(`/won/${initial.attemptId}`)
        return
      }

      if (next.status === 'failed') {
        setPhase('over')
        // The box page, the wallet and the dashboard all changed. Let the
        // server components behind this screen catch up.
        router.refresh()
        return
      }

      if (next.awaitingReplay) return setPhase('decide')

      setJustCleared(state.level)
      setTaps([])
      setLit(null)
      setPhase('cleared')
      later(() => setPhase('ready'), CLEARED_MS)
    },
    [clearTimers, initial.attemptId, later, post, router, state.level],
  )

  /** The countdown, while it is the player's turn. */
  useEffect(() => {
    if (phase !== 'tap') return

    const endsAt = Date.now() + msLeft
    const tick = setInterval(() => {
      const remaining = endsAt - Date.now()

      if (remaining <= 0) {
        clearInterval(tick)
        setMsLeft(0)
        // Send whatever they managed. The server will call it a miss, and it
        // gets to make that call rather than the browser announcing it.
        void submit(tapsRef.current)
        return
      }

      setMsLeft(remaining)
    }, 60)

    return () => clearInterval(tick)
    // msLeft is the starting value for this run of the clock, set once when the
    // phase turns to 'tap'. Re-running on every tick would restart the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    tapsRef.current = taps
  }, [taps])

  const onTap = (tile: number) => {
    if (phase !== 'tap' || !round) return

    setPressed(tile)
    later(() => setPressed(null), 120)

    const next = [...taps, tile]
    setTaps(next)

    if (next.length >= round.pattern.length) void submit(next)
  }

  /** Pay to carry on from this level, once the free replay is gone. */
  const retry = async () => {
    setPhase('sending')
    const result = await post('retry', {})
    if (!result) return setPhase('decide')
    startRound(result, 'decide')
  }

  /** Spend the one free replay. */
  const replay = async () => {
    setPhase('sending')
    const result = await post('replay', {})
    if (!result) return setPhase('decide')
    startRound(result, 'ready')
  }

  /** Give up on this run and open a fresh one at level 1. */
  const startAgain = async () => {
    setPhase('sending')
    const result = await post('restart', {})
    if (!result) return setPhase('decide')

    const fresh = result.state
    if (fresh.attemptId && fresh.attemptId !== initial.attemptId) {
      router.replace(`/play/${fresh.attemptId}`)
      return
    }

    setState(fresh)
    setPhase(fresh.status === 'playing' ? 'ready' : 'over')
  }

  const steps = phase === 'ready' ? stepsFor(state.level) : (round?.pattern.length ?? stepsFor(state.level))
  const nextAnswerSeconds = answerMsFor(state.level) / 1000
  const answerMs = round?.answerMs ?? 1
  const fraction = phase === 'tap' ? Math.max(0, Math.min(1, msLeft / answerMs)) : 1

  const cheer = CHEERS[Math.min(Math.max(justCleared, 1), CHEERS.length) - 1]

  const mood: GridMood =
    phase === 'watch' ? 'showing' : phase === 'tap' ? 'input' : phase === 'cleared' ? 'right' : phase === 'decide' ? 'wrong' : 'idle'

  // ---------------------------------------------------------------- the end
  if (phase === 'over') {
    const won = state.status === 'won'
    const beatenByBox = box.status === 'won' && box.winner_id !== null

    return (
      <div className="animate-rise text-center">
        <Mascot mood={won ? 'excited' : 'sad'} size={140} className="mx-auto" />

        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          {won ? 'You beat the box' : `Level ${state.levelsCleared + 1} got you`}
        </h1>

        <p className="mt-3 text-mist">
          {won
            ? state.message === 'You beat the box.'
              ? `${naira(box.prize_naira)} is yours, and the same goes to ${box.creator_name || 'the creator'}. Add your bank details and it will be sent by transfer.`
              : 'You cleared all ten — but somebody else got to this box first.'
            : `You cleared ${state.levelsCleared} of ${LEVELS}. Another coin, another go.`}
        </p>

        <div className="mt-8 grid gap-3">
          {won ? (
            <ButtonLink href="/claim" tone="gold" size="lg">
              <Trophy size={18} /> Claim your winnings
            </ButtonLink>
          ) : !beatenByBox ? (
            <ButtonLink href={`/b/${box.code}`} tone="gold" size="lg">
              <Zap size={18} /> Try again · 1 coin
            </ButtonLink>
          ) : null}

          <ButtonLink href="/home" tone="ghost" size="lg">
            Back to your boxes
          </ButtonLink>
        </div>
      </div>
    )
  }

  // ------------------------------------------------- where do you want to go
  if (phase === 'decide') {
    const freeReplay = state.replaysLeft > 0
    const coins = state.coins ?? 0
    const canContinue = coins >= COINS_PER_RETRY
    const canStartAgain = coins >= COINS_PER_PLAY

    return (
      <div className="animate-rise">
        {/* Not a failure screen. They have cleared levels and still have a run
            in progress — this is a fork in it, and the design says so. */}
        <div className="text-center">
          <Mascot mood="thinking" size={110} className="mx-auto" />
          <p className="mt-3 text-sm font-semibold tracking-[0.2em] text-dusk uppercase">
            Level {state.level}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {freeReplay ? 'Not that one — go again' : 'Where do you want to go?'}
          </h1>
          <p className="mt-2 text-sm text-mist">
            You have {state.levelsCleared} of {LEVELS}{' '}
            {state.levelsCleared === 1 ? 'level' : 'levels'} cleared.
          </p>
        </div>

        {/* Progress, so what is at stake is visible while choosing. */}
        <div className="mt-5 flex gap-1.5" aria-hidden>
          {Array.from({ length: LEVELS }, (_, index) => (
            <div
              key={index}
              className={
                'h-1.5 flex-1 rounded-full ' +
                (index < state.levelsCleared
                  ? 'bg-lime'
                  : index === state.levelsCleared
                    ? 'bg-gold'
                    : 'bg-white/10')
              }
            />
          ))}
        </div>

        <div className="mt-7 grid gap-3">
          {freeReplay ? (
            <Choice
              onClick={replay}
              tone="gold"
              icon={<RotateCcw size={20} />}
              title={`Take level ${state.level} again`}
              detail="Your one free replay. New pattern, same level, no charge."
              price="Free"
            />
          ) : (
            <Choice
              onClick={retry}
              tone="gold"
              disabled={!canContinue}
              icon={<Play size={20} />}
              title={`Carry on from level ${state.level}`}
              detail={
                canContinue
                  ? `Keep all ${state.levelsCleared} levels you have cleared.`
                  : `You need ${COINS_PER_RETRY} coins for this.`
              }
              price={`${COINS_PER_RETRY} coins`}
            />
          )}

          <Choice
            onClick={startAgain}
            tone="ghost"
            disabled={!canStartAgain}
            icon={<RefreshCw size={20} />}
            title="Start again from level 1"
            detail={
              canStartAgain
                ? 'A brand new run, and your cleared levels are reset.'
                : 'You need a coin for this.'
            }
            price={`${COINS_PER_PLAY} coin`}
          />
        </div>

        {!canStartAgain ? (
          <ButtonLink href="/wallet" tone="gold" size="lg" className="mt-4 w-full">
            <Coins size={18} /> Top up to keep playing
          </ButtonLink>
        ) : null}

        <div className="mt-6 flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-dusk">
            <Coins size={14} /> {coins} {coins === 1 ? 'coin' : 'coins'} left
          </span>
          <Link href="/home" className="text-dusk underline underline-offset-4 hover:text-mist">
            Leave for now
          </Link>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------ the game
  return (
    <div className="no-select">
      {/* progress through the ten levels */}
      <div className="mb-5 flex items-center gap-3">
        <Link
          href={`/b/${box.code}`}
          className="flex items-center gap-1 text-sm text-dusk hover:text-mist"
        >
          <ChevronLeft size={15} /> Box {box.code}
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Pill tone={state.replaysLeft > 0 ? 'cyan' : 'quiet'}>
            <RotateCcw size={13} /> {state.replaysLeft} free
          </Pill>
          <Pill tone="gold">
            <Coins size={13} /> {state.coins ?? 0}
          </Pill>
        </div>
      </div>

      <div className="mb-5 flex gap-1.5" aria-label={`Level ${state.level} of ${LEVELS}`}>
        {Array.from({ length: LEVELS }, (_, index) => (
          <div
            key={index}
            className={
              'h-1.5 flex-1 rounded-full transition ' +
              (index < state.levelsCleared
                ? 'bg-lime'
                : index === state.levelsCleared
                  ? 'bg-violet'
                  : 'bg-white/10')
            }
          />
        ))}
      </div>

      {/* The clock, or the reason there isn't one yet.
          Fixed height on purpose: this text changes on every phase, and if the
          block were allowed to resize, the grid underneath would jump between
          "watch" and "your turn" — moving the tap targets at the exact moment
          the player starts aiming at them. */}
      <div className="mb-5 flex h-[7.5rem] flex-col justify-center text-center">
        <p className="text-sm font-semibold tracking-[0.2em] text-dusk uppercase">
          {phase === 'cleared' ? `Level ${justCleared} cleared` : `Level ${state.level}`}
        </p>

        {phase === 'cleared' ? (
          <div className="animate-pop">
            <p className="bg-linear-to-r from-lime via-cyan to-violet bg-clip-text text-4xl font-bold text-transparent">
              {cheer.word}
            </p>
            <p className="mt-1 text-sm text-mist">{cheer.note}</p>
          </div>
        ) : phase === 'tap' ? (
          <p className="tabular mt-1 text-5xl font-bold text-chalk">
            {(msLeft / 1000).toFixed(1)}
            <span className="text-2xl text-dusk">s</span>
          </p>
        ) : (
          <p className="mt-1 text-2xl font-bold text-mist">
            {phase === 'watch'
              ? 'Watch…'
              : phase === 'counting'
                ? 'Get ready'
                : phase === 'sending'
                  ? '…'
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
        <Grid
          lit={lit}
          mood={mood}
          celebrate={phase === 'cleared'}
          disabled={phase !== 'tap'}
          pressed={pressed}
          onTap={onTap}
        />

        {phase === 'counting' && round ? (
          <Countdown onDone={() => showPattern(round)} />
        ) : null}
      </div>

      {/* how many taps in, so a player can tell where they are */}
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

      {/* Reserved whether or not the card is in it, for the same reason. */}
      <div className="mt-6 min-h-[13rem]">
        {phase === 'ready' ? (
        <Card className="text-center">
          <p className="text-sm leading-relaxed text-mist">
            {state.levelsCleared === 0
              ? `${steps} tiles will flash. Tap them back in the same order.`
              : `${steps} flashes this time, and ${nextAnswerSeconds} seconds to answer.`}{' '}
            The clock is stopped until you start, and stays stopped while the pattern plays.
          </p>

          <Button onClick={beginLevel} tone="gold" size="lg" className="mt-4 w-full">
            {state.levelsCleared === 0 ? 'Start level 1' : `Start level ${state.level}`}
          </Button>
        </Card>
        ) : null}
      </div>
    </div>
  )
}

/**
 * One of the ways out of a missed level.
 *
 * A whole tappable card rather than a button with text beside it: this is a
 * decision about money, and both options need to state their price in the same
 * shape so neither is the one you press by accident.
 */
function Choice({
  onClick,
  icon,
  title,
  detail,
  price,
  tone,
  disabled,
}: {
  onClick: () => void
  icon: React.ReactNode
  title: string
  detail: string
  price: string
  tone: 'gold' | 'ghost'
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'no-select flex w-full items-center gap-4 rounded-3xl p-4 text-left transition ' +
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ' +
        (tone === 'gold'
          ? 'bg-linear-to-br from-gold/20 to-violet/15 ring-1 ring-gold/40 hover:from-gold/25'
          : 'bg-white/5 ring-1 ring-white/12 hover:bg-white/8')
      }
    >
      <span
        className={
          'grid size-11 shrink-0 place-items-center rounded-2xl ' +
          (tone === 'gold' ? 'bg-gold/20 text-gold' : 'bg-white/8 text-mist')
        }
      >
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-mist">{detail}</span>
      </span>

      <span
        className={
          'shrink-0 rounded-full px-3 py-1 text-xs font-bold ' +
          (tone === 'gold' ? 'bg-gold text-ink' : 'bg-white/10 text-chalk')
        }
      >
        {price}
      </span>
    </button>
  )
}
