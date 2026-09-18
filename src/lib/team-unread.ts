'use client'

import { useSyncExternalStore } from 'react'
import type { Pulse } from './teams.ts'

/**
 * Which teams have said something since you last looked.
 *
 * ## Why this is kept on the device
 *
 * "When did I last read this chat" changes every time somebody glances at a
 * screen. Keeping it on the server means a write per glance, a row per
 * person per team, and a request on the way *in* to a chat as well as on the
 * way out — for a fact that is only ever used to draw a dot. So it is a
 * timestamp per team in localStorage, beside the theme.
 *
 * The cost is honest and small: read a chat on your laptop and your phone
 * still shows the dot until you open it there too. That is the same
 * behaviour as most mail clients had for twenty years, and it is a better
 * trade than making every glance cost a round trip.
 *
 * ## Why the comparison is a pure function
 *
 * `unreadIn` takes what the server said and what this device remembers and
 * returns the list. No React, no storage, no clock — so the awkward cases
 * (a team with nothing in it, a team read after its last message, a clock
 * that disagrees) are unit tests.
 */

const KEY = 'pad-team-seen'

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/**
 * The raw string, never a parsed object.
 *
 * `useSyncExternalStore` compares snapshots by identity, and a freshly
 * parsed object is a new one every time — which is not a stale value, it is
 * an infinite render loop. The same rule the theme and the folds follow.
 */
function read(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    // Blocked site data. Everything reads as unread, which is the safe way
    // round: a dot nobody needed beats a message nobody saw.
    return ''
  }
}

const onServer = () => ''

export function parseSeen(raw: string): Record<string, number> {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return {}
    const out: Record<string, number> = {}
    for (const [id, at] of Object.entries(value as Record<string, unknown>)) {
      if (typeof at === 'number' && Number.isFinite(at)) out[id] = at
    }
    return out
  } catch {
    return {}
  }
}

/** Which of these teams have something newer than this device has seen. */
export function unreadIn(pulses: Pulse[], seen: Record<string, number>): Pulse[] {
  return pulses.filter((pulse) => pulse.lastAt > 0 && pulse.lastAt > (seen[pulse.teamId] ?? 0))
}

/**
 * Marks a team as read, up to a moment.
 *
 * The moment is passed in rather than taken as "now": what has been read is
 * the last message on screen, and a message that arrives while somebody is
 * reading has not been.
 */
export function markSeen(teamId: string, at: number): void {
  if (!teamId || !at) return
  const seen = parseSeen(read())
  if ((seen[teamId] ?? 0) >= at) return
  seen[teamId] = at
  try {
    localStorage.setItem(KEY, JSON.stringify(seen))
  } catch {
    // It costs the memory of having read it, not the reading.
  }
  for (const listener of listeners) listener()
}

/** What this device has seen, for the component drawing the dots. */
export function useSeen(): Record<string, number> {
  return parseSeen(useSyncExternalStore(subscribe, read, onServer))
}

/** Forgotten with everything else when the device changes hands. */
export function forgetSeen(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing was kept.
  }
  for (const listener of listeners) listener()
}
