'use client'

import { Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { openTeamNext, useMode } from '@/lib/mode'
import { unreadIn, useSeen } from '@/lib/team-unread'
import { teamPulse, type Pulse } from '@/lib/teams'

/**
 * "Ada said something in Tuesday" — on the notes, when there is.
 *
 * ## Why the notes screen has to say anything at all
 *
 * Because Team is behind a switch, and a switch is a thing you have to
 * remember to press. Somebody working in their own notes all morning has
 * no way of knowing three people have been agreeing work in a chat, and
 * the only thing worse than a team screen nobody opens is a team screen
 * nobody opens *and* did not know to.
 *
 * ## Why it is a line and not a badge, a banner or a bell
 *
 * A line that says who said something, in which team, and goes away when
 * it is read. It is a link into that exact team rather than into Team mode
 * in general — landing in whichever team happens to be first is how a
 * notification teaches people to ignore it.
 *
 * ## What it costs
 *
 * One request a minute while the tab is in front of somebody and signed
 * in, asking one question: when did each of my teams last have something
 * said in it. See `team_pulse()`. What has been read is kept on the
 * device, so the comparison costs nothing at all.
 */

/** How often to ask. A minute is well inside "I did not know about that". */
const EVERY_MS = 60_000

export default function TeamNudge({ accountId }: { accountId: string | null }) {
  const { mode, set } = useMode()
  const seen = useSeen()
  const [pulses, setPulses] = useState<Pulse[]>([])

  useEffect(() => {
    // Only where there is something to ask about, and only on the side of
    // the app that cannot see the chat already.
    if (!accountId || mode !== 'mine') return
    let cancelled = false
    const ask = async () => {
      if (document.visibilityState !== 'visible') return
      const said = await teamPulse()
      if (!cancelled) setPulses(said)
    }
    void ask()
    const id = setInterval(() => void ask(), EVERY_MS)
    const onVisible = () => void ask()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [accountId, mode])

  const unread = unreadIn(pulses, seen)
  if (mode !== 'mine' || unread.length === 0) return null

  const first = unread[0]
  const more = unread.length - 1

  return (
    <button
      type="button"
      onClick={() => {
        openTeamNext(first.teamId)
        set('team')
      }}
      className="mt-2 flex w-full items-center gap-2 rounded-full bg-[var(--color-accent-soft)] px-3 py-2 text-left text-[13px] text-[var(--color-ink)]"
    >
      <Users size={14} className="shrink-0 text-[var(--color-accent)]" />
      <span className="min-w-0 flex-1 truncate">
        {first.lastAuthor ? `${first.lastAuthor} said something` : 'Something was said'} in{' '}
        <span className="font-medium">{first.name}</span>
        {more > 0 && ` · and ${more} other ${more === 1 ? 'team' : 'teams'}`}
      </span>
      <span className="shrink-0 text-[12px] text-[var(--color-accent)]">Open</span>
    </button>
  )
}
