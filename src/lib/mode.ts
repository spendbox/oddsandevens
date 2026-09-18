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
 * ## It lasts for a visit, not forever
 *
 * In `sessionStorage`, deliberately. Kept in localStorage it was sticky in
 * the worst way: press Team once and every future opening of the app landed
 * on a team screen, which is not what this app is — the notes are, and they
 * are what should be there when somebody opens it in the morning. A session
 * is long enough to survive the one navigation that matters (a team's link,
 * which opens the sign-in page and then the app) and short enough that the
 * app always opens on your own notes.
 *
 * Read through `useSyncExternalStore` with a constant server snapshot for
 * the reason the theme is — the notes screen is server-rendered, and a
 * value read from storage during the first client render is a hydration
 * error on every load.
 */

const KEY = 'pad-mode'

/** `mine` on the wire, "Me" on the screen. */
export type Mode = 'mine' | 'team'

/**
 * Opens in Team for this visit only.
 *
 * Used by a team's own link, which is a page somebody arrives at *wanting*
 * the team — and by nothing else, because every other way in should land
 * on the notes.
 */
export function askForTeam(): void {
  try {
    sessionStorage.setItem(KEY, 'team')
  } catch {
    // The app opens on the notes instead, and the switch is at the top.
  }
}

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
    return sessionStorage.getItem(KEY) === 'team' ? 'team' : 'mine'
  } catch {
    // Blocked site data, or a private window. Me is the default and the
    // safe answer: it is the half of the app that needs nothing at all.
    return 'mine'
  }
}

const onServer = () => 'mine' as const

export function useMode(): { mode: Mode; set: (mode: Mode) => void } {
  const mode = useSyncExternalStore(subscribe, read, onServer)
  const set = (next: Mode) => {
    try {
      if (next === 'team') sessionStorage.setItem(KEY, 'team')
      else sessionStorage.removeItem(KEY)
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
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing was kept.
  }
  for (const listener of listeners) listener()
}
