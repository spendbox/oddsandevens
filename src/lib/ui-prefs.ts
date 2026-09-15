'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Interface preferences: theme, whether the sidebar is open, how wide the
 * page runs.
 *
 * All three live on `<html>` as data attributes and in localStorage, not in
 * React state. An inline script in the root layout applies them before the
 * first paint, which is what stops a dark-mode user seeing a white flash and
 * stops someone who collapsed the sidebar watching it swing shut on every
 * load. Reading them into state inside an effect would mean React briefly
 * disagreeing with the page it is rendering onto.
 *
 * useSyncExternalStore is the tool for exactly this shape: a value that lives
 * outside React, differs between server and client, and must not cause a
 * hydration mismatch.
 */

export interface Pref<T extends string> {
  /** localStorage key. */
  key: string
  /** Attribute on <html>, without the `data-` prefix. */
  attr: string
  /** Allowed values. Anything else is treated as unset. */
  values: readonly T[]
}

export const THEME = { key: 'pad-theme', attr: 'theme', values: ['light', 'dark'] } as const
export const SIDEBAR = { key: 'pad-sidebar', attr: 'sidebar', values: ['open', 'closed'] } as const
export const WIDTH = { key: 'pad-width', attr: 'width', values: ['wide', 'narrow'] } as const

/**
 * The script that applies the saved preferences before anything is painted.
 * Kept here, next to the keys it reads, so the two cannot drift apart.
 */
export const PREFS_SCRIPT = `(function(){try{var p=[['pad-theme','theme'],['pad-sidebar','sidebar'],['pad-width','width']];for(var i=0;i<p.length;i++){var v=localStorage.getItem(p[i][0]);if(v){document.documentElement.setAttribute('data-'+p[i][1],v)}}}catch(e){}})()`

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function announce() {
  for (const listener of listeners) listener()
}

/**
 * The current value of a preference, or null when it has never been set —
 * which for the theme honestly means "following the system".
 */
export function usePref<T extends string>(pref: Pref<T>): {
  value: T | null
  set: (next: T) => void
} {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      const found = document.documentElement.getAttribute(`data-${pref.attr}`)
      return (pref.values as readonly string[]).includes(found ?? '') ? (found as T) : null
    },
    // The server cannot know, and neither can the first client render if it is
    // to match what the server sent.
    () => null,
  )

  const set = useCallback(
    (next: T) => {
      document.documentElement.setAttribute(`data-${pref.attr}`, next)
      try {
        localStorage.setItem(pref.key, next)
      } catch {
        // A preference that does not survive a reload is a smaller problem
        // than a crash in a browser with site data blocked.
      }
      announce()
    },
    [pref],
  )

  return { value, set }
}
