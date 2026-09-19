'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Interface preferences: theme, whether the sidebar is open, how wide the
 * page runs, and how large the text is set.
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
 * How large the document's text is set.
 *
 * Unset means `medium`, and medium is deliberately larger than the app used to
 * be: text you have to lean towards is the single most common complaint about
 * an editor, and a default nobody has to find is worth more than a setting
 * everybody has to. The two neighbours exist because reading distance is a
 * fact about a person and their desk, not something an app can know.
 */
export const TEXT = {
  key: 'pad-text',
  attr: 'text',
  values: ['medium', 'large', 'huge'],
} as const
/**
 * The script that applies the saved preferences before anything is painted.
 * Kept here, next to the keys it reads, so the two cannot drift apart.
 */
/**
 * The preferences, applied before the first paint — and the phone's own bar
 * painted to match.
 *
 * ## Why the bar cannot be a media query
 *
 * `<meta name="theme-color" media="(prefers-color-scheme: dark)">` answers
 * what the *system* is set to. This app lets somebody choose light or dark
 * for itself, so the two disagree the moment anybody uses that setting: a
 * white strip carrying the time and the battery above a near-black app, or
 * the other way round. A manifest is worse again — it holds one colour for
 * every theme there will ever be, and an installed app takes its launch
 * colour from it.
 *
 * So the bar is painted from the value the stylesheet actually resolved.
 * `--color-paper` is defined once in globals.css, for both themes and for
 * the in-app override, and reading it back means there is no second copy of
 * those two hex values to keep in step.
 *
 * Every matching tag is written, not the first one. The framework renders a
 * static default of its own, this runs before it is parsed and adds one, and
 * a browser takes whichever of them it sees first — so the only safe answer
 * is that they all say the same thing. Any `media` on them comes off for the
 * same reason: a tag that only applies half the time is a tag that disagrees
 * with this the other half.
 *
 * ## Why a MutationObserver rather than a call from the theme setter
 *
 * Because the attribute is the thing that decides, and it is written from
 * two places already — this script, and `usePref` below. Watching the
 * attribute means neither of them has to remember, and a third way of
 * changing it in a year is covered for free.
 */
export const PREFS_SCRIPT = `(function(){try{var p=[['pad-theme','theme'],['pad-sidebar','sidebar'],['pad-width','width'],['pad-text','text']];for(var i=0;i<p.length;i++){var v=localStorage.getItem(p[i][0]);if(v){document.documentElement.setAttribute('data-'+p[i][1],v)}}}catch(e){}
function paint(){try{var c=getComputedStyle(document.documentElement).getPropertyValue('--color-paper').trim();if(!c)return;var m=document.querySelectorAll('meta[name="theme-color"]');if(!m.length){var n=document.createElement('meta');n.setAttribute('name','theme-color');n.setAttribute('content',c);document.head.appendChild(n);return}for(var i=0;i<m.length;i++){m[i].removeAttribute('media');m[i].setAttribute('content',c)}}catch(e){}}
paint();
try{if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',paint)}window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',paint);new MutationObserver(paint).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']})}catch(e){}})()`

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
