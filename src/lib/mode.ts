'use client'

import { useSyncExternalStore } from 'react'

/**
 * Whether this is a place to write, or a place to work with other people.
 *
 * ## Why a mode and not a fourth tab
 *
 * Because a team is not another view of your notes — it is a different thing
 * the app is for, with its own screen, its own input and its own rules about
 * who sees what. A tab beside Notes and Actions would say it was one more
 * list of yours, and the first question anybody would have is whether their
 * notes were now shared. They are not, and the shape of the control has to
 * say so: two modes, and you are in one of them.
 *
 * Mine is the default and stays the default. Everything this app promises —
 * open it and start typing, no account, nothing waits for a network — is
 * about that side, and somebody who never presses the switch never meets a
 * team at all.
 *
 * ## Where it is kept
 *
 * On the device, beside the theme, because it is about this screen rather
 * than about the account: the same person may want their notes on a laptop
 * and the team board on a phone. Read through `useSyncExternalStore` with a
 * constant server snapshot for the reason the theme is — the notes screen is
 * server-rendered, and a value read from localStorage during the first
 * client render is a hydration error on every load.
 */

const KEY = 'pad-mode'

/**
 * `mine` on the wire, "Me" on the screen.
 *
 * The stored value is left alone deliberately: renaming what is written in
 * localStorage would put everybody who had chosen Team back on the notes
 * for no reason anybody could see.
 */
export type Mode = 'mine' | 'team'

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

function read(): Mode {
  try {
    return localStorage.getItem(KEY) === 'team' ? 'team' : 'mine'
  } catch {
    // Blocked site data, or a private window. Mine is the default and the
    // safe answer: it is the half of the app that needs nothing at all.
    return 'mine'
  }
}

const onServer = () => 'mine' as const

export function useMode(): { mode: Mode; set: (mode: Mode) => void } {
  const mode = useSyncExternalStore(subscribe, read, onServer)
  const set = (next: Mode) => {
    try {
      if (next === 'team') localStorage.setItem(KEY, 'team')
      else localStorage.removeItem(KEY)
    } catch {
      // It costs the memory of the choice, not the choice itself.
    }
    for (const listener of listeners) listener()
  }
  return { mode, set }
}

/**
 * Which team to open when Team mode next appears.
 *
 * A module value rather than storage: it is true for one press — the mark
 * on the notes saying "Ada said something in Tuesday" has to land in
 * *that* team and not in whichever one happens to be first — and it is
 * meaningless a second later. Taking it clears it, so it cannot leak into
 * the next visit.
 */
let pending: string | null = null

export function openTeamNext(teamId: string): void {
  pending = teamId
}

export function takePendingTeam(): string | null {
  const id = pending
  pending = null
  return id
}

/** Puts the app back on the notes. Used when an account goes away. */
export function backToMine(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing was kept.
  }
  for (const listener of listeners) listener()
}
