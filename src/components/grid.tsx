'use client'

import { TILE_COUNT } from '@/lib/game'
import { cx } from './ui'

export type GridMood = 'idle' | 'showing' | 'input' | 'right' | 'wrong'

const MOOD_RING: Record<GridMood, string> = {
  idle: 'ring-white/8',
  showing: 'ring-cyan/40',
  input: 'ring-violet/50',
  right: 'ring-lime/60',
  wrong: 'ring-rose/60',
}

/**
 * Nine tiles. Everything the player ever does happens here.
 *
 * Two things about it are deliberate and easy to undo by accident:
 *
 *  - It reacts on pointerdown, not on click. A click does not land until the
 *    finger lifts, and at level 10 a player has five seconds for thirteen taps.
 *    Waiting for the lift throws away most of their margin.
 *
 *  - It is a fixed square that scales with the screen, so the grid never
 *    reflows mid-round. A tile that moves under a thumb is a tile that gets
 *    missed, and the player will rightly blame the game.
 */
export function Grid({
  lit,
  mood,
  disabled,
  pressed,
  celebrate = false,
  onTap,
}: {
  /** The tile currently glowing, while the pattern plays. */
  lit: number | null
  mood: GridMood
  disabled: boolean
  /** The tile the player is touching right now, for feedback. */
  pressed: number | null
  /** Light the whole board up — a level has just been cleared. */
  celebrate?: boolean
  onTap: (tile: number) => void
}) {
  return (
    <div
      className={cx(
        'no-select mx-auto grid aspect-square w-full max-w-[min(88vw,26rem)] grid-cols-3 gap-2.5',
        'rounded-[2rem] bg-black/35 p-2.5 ring-2 transition-[box-shadow,--tw-ring-color] duration-200',
        MOOD_RING[mood],
        mood === 'wrong' && 'animate-shake',
        celebrate && 'shadow-[0_0_60px_-10px_rgb(163_230_53/0.55)]',
      )}
    >
      {Array.from({ length: TILE_COUNT }, (_, tile) => {
        const isLit = lit === tile
        const isPressed = pressed === tile

        return (
          <button
            key={tile}
            type="button"
            aria-label={`Tile ${tile + 1}`}
            disabled={disabled}
            // Fire the instant the finger lands. See the note above.
            onPointerDown={(event) => {
              if (disabled) return
              event.preventDefault()
              onTap(tile)
            }}
            className={cx(
              'rounded-tile transition-[background-color,box-shadow,transform] duration-100',
              'ring-1 ring-inset',
              celebrate
                ? 'animate-pop bg-linear-to-br from-lime/80 to-cyan/70 ring-white/40'
                : isLit
                ? 'scale-[1.04] bg-linear-to-br from-cyan to-violet ring-white/50 ' +
                    'shadow-[0_0_28px_6px_rgb(34_211_238/0.45)]'
                : isPressed
                  ? 'scale-[0.96] bg-violet/70 ring-violet/60 shadow-[0_0_18px_2px_rgb(168_85_247/0.4)]'
                  : 'bg-white/6 ring-white/10',
              disabled ? 'cursor-default' : 'cursor-pointer hover:bg-white/10',
            )}
          />
        )
      })}
    </div>
  )
}
