'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * The light/dark choice.
 *
 * It lives in the DOM and in localStorage, not in React state, because an
 * inline script in the root layout has already applied it before React runs —
 * that is what stops a dark-mode user seeing a white flash. Reading it into
 * state inside an effect would mean React briefly disagreeing with the page it
 * is rendering onto, so this subscribes to the real value instead.
 *
 * useSyncExternalStore is the tool for exactly this shape: a value that lives
 * outside React, differs between server and client, and must not cause a
 * hydration mismatch.
 */
export type Theme = 'light' | 'dark' | null

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function clientSnapshot(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  return attr === 'dark' || attr === 'light' ? attr : null
}

/**
 * The server cannot know the choice, and neither can the first client render
 * if it is to match. null means "following the system", which is the honest
 * answer and the one the inline script leaves in place when nothing is saved.
 */
function serverSnapshot(): Theme {
  return null
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot)

  const toggle = useCallback(() => {
    const current =
      theme ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    const next: Exclude<Theme, null> = current === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem('pad-theme', next)
    } catch {
      // A theme that does not survive a reload is a smaller problem than a
      // crash in a browser with site data blocked.
    }
    for (const listener of listeners) listener()
  }, [theme])

  return { theme, toggle }
}
