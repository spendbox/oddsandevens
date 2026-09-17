'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

/**
 * Which sections the reader has folded away, remembered on this device.
 *
 * One store for every folding thing in the interface — the side menu's
 * sections, the Library's folders — because they are the same kind of fact:
 * about this screen, not about the document, so they belong beside the theme
 * and the page width rather than in anything that syncs.
 *
 * ## Why useSyncExternalStore and not a lazy useState
 *
 * The components that read this are server-rendered. The server has no
 * localStorage, so a lazy initial state disagreed with the HTML the server
 * sent and React threw a hydration error on every load for anybody who had
 * ever folded a section.
 *
 * The snapshot is the raw string, never a parsed Set. `useSyncExternalStore`
 * compares snapshots by identity, and a freshly parsed Set is a new object
 * every time — which is not a stale value, it is an infinite render loop.
 */

const KEY = 'pad-folded'

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    // Blocked site data, or a private window. Everything opening unfolded is a
    // much smaller problem than a crash on load.
    return ''
  }
}

function write(value: string) {
  try {
    localStorage.setItem(KEY, value)
  } catch {
    // It costs the memory of a fold, not the fold itself.
  }
  for (const listener of listeners) listener()
}

export interface Folds {
  /** True when this section has been folded away. Everything starts open. */
  folded: (id: string) => boolean
  toggle: (id: string) => void
  /** Folds or unfolds a whole set at once — what "Collapse all" is. */
  set: (ids: string[], shut: boolean) => void
}

export function useFolds(): Folds {
  const raw = useSyncExternalStore(subscribe, read, () => '')
  const shut = useMemo<Set<string>>(() => {
    if (!raw) return new Set()
    try {
      const parsed: unknown = JSON.parse(raw)
      return new Set(Array.isArray(parsed) ? (parsed as string[]) : [])
    } catch {
      return new Set()
    }
  }, [raw])

  const folded = useCallback((id: string) => shut.has(id), [shut])

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(shut)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      write(JSON.stringify([...next]))
    },
    [shut],
  )

  const set = useCallback(
    (ids: string[], close: boolean) => {
      const next = new Set(shut)
      for (const id of ids) {
        if (close) next.add(id)
        else next.delete(id)
      }
      write(JSON.stringify([...next]))
    },
    [shut],
  )

  return { folded, toggle, set }
}
