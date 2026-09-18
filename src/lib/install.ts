'use client'

import { useSyncExternalStore } from 'react'

/**
 * Whether this app can be installed, and the browser's own offer to do it.
 *
 * ## Why any of this is needed
 *
 * A browser decides on its own whether to offer an install, and where it puts
 * the offer: Chrome and Edge show a small icon at the right-hand end of the
 * address bar, and most people have never noticed it. Safari on a phone does
 * not offer at all — it is Share, then Add to Home Screen, two taps into a
 * menu nobody opens by accident.
 *
 * So the app asks as well, once, in its own bar. Chrome hands over the offer
 * as a `beforeinstallprompt` event that can be kept and fired later from a
 * real press, which is exactly what a button is for.
 *
 * ## Why the listener is at the module, not in a component
 *
 * `beforeinstallprompt` fires early — often before React has finished
 * hydrating — and it fires once. A listener added inside an effect is a
 * listener added after the event has already been and gone, which is why the
 * button used to appear only after a reload. Importing this file installs the
 * listener; the component reads what it caught.
 *
 * ## Why useSyncExternalStore
 *
 * The same reason the theme and the folds use it. The notes screen is
 * server-rendered, the server has no `window`, and a value read straight out
 * of one during the first client render is a hydration error on every load.
 * The server snapshot says "no offer", which is true there.
 */

/** The event Chrome hands over, as much of it as this uses. */
interface InstallOffer extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** What the button needs to know, as one string so snapshots compare by value. */
export type InstallState = 'none' | 'offered' | 'manual' | 'installed'

let offer: InstallOffer | null = null
let state: InstallState = 'none'
const listeners = new Set<() => void>()

function announce(next: InstallState) {
  if (state === next) return
  state = next
  for (const listener of listeners) listener()
}

/**
 * Already running as an installed app.
 *
 * Two questions because two platforms answer differently: everywhere else it
 * is the display mode, and on an iPhone it is a non-standard flag on
 * `navigator` that has never been anything else.
 */
function installed(): boolean {
  if (typeof window === 'undefined') return false
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone
  return (
    standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches === true
  )
}

/**
 * An iPhone or iPad, where there is no offer to catch and the two steps have
 * to be described instead.
 *
 * Read from the touch points as well as the platform string, because an iPad
 * has called itself a Mac since iPadOS 13.
 */
export function needsManualInstall(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  // Every browser on iOS is Safari underneath, and only Safari itself can add
  // to the home screen — but they all show the same Share menu, so the
  // instruction is right for all of them.
  return iOS && !installed()
}

if (typeof window !== 'undefined') {
  if (installed()) state = 'installed'
  else if (needsManualInstall()) state = 'manual'

  window.addEventListener('beforeinstallprompt', (event) => {
    // Keeping the event is what lets a button fire it later; without this the
    // browser shows its own bar at a moment of its choosing, or not at all.
    event.preventDefault()
    offer = event as InstallOffer
    announce('offered')
  })

  window.addEventListener('appinstalled', () => {
    offer = null
    announce('installed')
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const snapshot = () => state
const onServer = () => 'none' as const

/** What the install button should be, if anything. */
export function useInstall(): InstallState {
  return useSyncExternalStore(subscribe, snapshot, onServer)
}

/**
 * Shows the browser's own install dialog, and reports what was said.
 *
 * The offer can only be used once: a browser that has been asked and refused
 * will not hand over another, so the button goes away either way rather than
 * sitting there doing nothing the second time.
 */
export async function askToInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!offer) return 'unavailable'
  const asked = offer
  offer = null
  try {
    await asked.prompt()
    const { outcome } = await asked.userChoice
    announce(outcome === 'accepted' ? 'installed' : 'none')
    return outcome
  } catch {
    announce('none')
    return 'unavailable'
  }
}
