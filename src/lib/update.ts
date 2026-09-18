'use client'

import { useSyncExternalStore } from 'react'

/**
 * Noticing that a new version has been deployed.
 *
 * ## What already happened without this, and what did not
 *
 * The page itself is fetched from the network first, so *reloading* an
 * installed app has always picked up a new deploy — the fresh HTML points at
 * fresh, content-hashed scripts and the service worker never stands in their
 * way. The gap is that an installed app is not a tab somebody closes. It sits
 * on a home screen for a fortnight, resumed rather than reopened, and it will
 * happily run a version from before three deploys ago until something makes
 * it reload.
 *
 * So the app checks, and when there is a new version it says so and offers to
 * take it. It never reloads on its own: somebody may be halfway through a
 * sentence, and this app's oldest promise is that it does not lose what you
 * are typing.
 *
 * ## When it checks
 *
 * On opening, every half hour while it is open, and whenever it is brought
 * back to the front after a while away — which is the moment an app on a
 * phone has most likely missed something. Each check is a conditional request
 * for one small file, and the browser does most of them from its own cache.
 *
 * ## Why the listener is at module scope
 *
 * The same reason as `lib/install.ts`: registration happens once, the events
 * arrive whenever they arrive, and a listener added inside a component's
 * effect is one that can miss the thing it is watching for. The component
 * reads the answer.
 */

/** How often to ask, while the app is open. */
const EVERY_MS = 30 * 60_000
/** How long away is long enough that coming back is worth a check. */
const STALE_MS = 15 * 60_000

let ready = false
let last = 0
let registration: ServiceWorkerRegistration | null = null
const listeners = new Set<() => void>()

function announce() {
  if (ready) return
  ready = true
  for (const listener of listeners) listener()
}

/** A worker that is installed but is not the one running this page. */
function waitingOn(reg: ServiceWorkerRegistration): boolean {
  return !!reg.waiting && !!navigator.serviceWorker.controller
}

function watch(reg: ServiceWorkerRegistration) {
  registration = reg
  if (waitingOn(reg)) announce()

  reg.addEventListener('updatefound', () => {
    const arriving = reg.installing
    if (!arriving) return
    arriving.addEventListener('statechange', () => {
      /*
        `installed` with a controller already present means this is a second
        version arriving, not the first one being set up. Without that check
        the notice appears on somebody's very first visit, offering to update
        an app they have only just opened.
      */
      if (arriving.state === 'installed' && navigator.serviceWorker.controller) announce()
    })
  })
}

function check() {
  const now = Date.now()
  if (now - last < 60_000) return
  last = now
  void registration?.update().catch(() => {
    // Offline, or the check was refused. It will be asked again.
  })
}

/**
 * Registers the service worker and starts watching for new versions.
 *
 * Called once, from the workspace. Registration is deliberately after load:
 * it is not on the path of the first paint, and nothing on screen waits for
 * it.
 */
export function watchForUpdates() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  const register = () => {
    last = Date.now()
    void navigator.serviceWorker
      .register('/sw.js')
      .then(watch)
      .catch(() => {
        // No offline start-up on this browser. Everything else still works.
      })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })

  setInterval(check, EVERY_MS)
  document.addEventListener('visibilitychange', () => {
    // Coming back after a while is when an app on a phone is most likely to
    // have missed a deploy. Coming back after ten seconds is not.
    if (document.visibilityState === 'visible' && Date.now() - last > STALE_MS) check()
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const snapshot = () => ready
const onServer = () => false

/** Whether a newer version of the app is sitting there waiting to be taken. */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(subscribe, snapshot, onServer)
}

/**
 * Takes the new version.
 *
 * A worker that is waiting is told to take over first — otherwise the reload
 * is served by the old one and nothing changes, which reads as a button that
 * does not work. The reload happens either way.
 */
export function applyUpdate() {
  try {
    registration?.waiting?.postMessage({ type: 'skip-waiting' })
  } catch {
    // Nothing waiting, or the message was refused. The reload still picks up
    // whatever is current.
  }
  window.location.reload()
}
