'use client'

import { Users, User } from 'lucide-react'
import { useMode } from '@/lib/mode'

/**
 * Me, or the team's. One card that turns over.
 *
 * ## Why a flip and not two pills
 *
 * Two pills side by side spend the width of both to say which one you are
 * in, on a bar that already holds a name, an account, an install and
 * sometimes an update. A card is one control the size of one word: it shows
 * where you are, and pressing it turns it over to the other side. Half the
 * room, and the turn is what says the two are opposite faces of the same
 * thing rather than two places on a list.
 *
 * ## The animation is real, and it is also optional
 *
 * The two faces are stacked and the box is rotated in 3D, so the back of
 * one is genuinely the front of the other rather than a fade between two
 * labels. `prefers-reduced-motion` turns the rotation off and leaves the
 * swap, because a control that spins is exactly what somebody who asked
 * for less movement asked to be rid of.
 */
export default function ModeToggle() {
  const { mode, set } = useMode()
  const team = mode === 'team'

  return (
    <button
      type="button"
      onClick={() => set(team ? 'mine' : 'team')}
      aria-label={team ? 'In the team. Press to go back to your own notes.' : 'Your own notes. Press to go to the team.'}
      title={team ? 'Your own notes' : 'The team'}
      /*
        A fixed size, because the two faces are stacked on top of each other
        and neither can size the box: a card that changed width as it turned
        would push everything beside it about twice per press.
      */
      className="pad-flip relative h-8 w-[5.25rem] shrink-0 text-[13px]"
      data-flipped={team ? 'true' : 'false'}
    >
      <span className="pad-flip-inner">
        <span className="pad-flip-face rounded-full bg-[var(--color-hover)] text-[var(--color-muted)]">
          <User size={13} />
          Me
        </span>
        <span className="pad-flip-face pad-flip-back rounded-full bg-[var(--color-ink)] text-[var(--color-paper)]">
          <Users size={13} />
          Team
        </span>
      </span>
    </button>
  )
}
