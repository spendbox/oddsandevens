/*
 * Service worker: the part that makes Onepad open with no network.
 *
 * Two strategies, chosen by what is being fetched:
 *
 *  - Build assets under /_next/static are content-hashed, so their URL changes
 *    whenever their content does. That makes them safe to serve from the cache
 *    first, forever, with no staleness risk.
 *  - The page itself is network-first. A cache-first page would keep serving
 *    yesterday's HTML after a deploy, pointing at asset URLs that no longer
 *    exist, and the app would come up blank until someone cleared their site
 *    data — which is not something to ask of anybody.
 *
 * Documents are not cached here at all. They live in IndexedDB, which is
 * already offline, already survives eviction better, and is not something a
 * cache eviction should be able to take away.
 */

const VERSION = 'pad-v1'
const SHELL = `${VERSION}-shell`
const ASSETS = `${VERSION}-assets`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['/']))
      // A failed precache must not leave the worker uninstalled and the app
      // with no offline story at all; the fetch handler fills the gap later.
      .catch(() => {}),
  )
})

/*
 * Taking over when the app says so, and not before.
 *
 * This used to call skipWaiting() as soon as it installed, which sounds like
 * "updates arrive promptly" and is actually "the page you are typing into is
 * now being served by a different version of the app than the one running in
 * it". The app asks instead — see lib/update.ts, which offers the reader an
 * Update and reloads once this has answered — so a new version lands at a
 * moment somebody chose rather than in the middle of a sentence.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Never cache the auth or data calls to Supabase's domain — they are
  // cross-origin and already skipped above — but also skip anything the app
  // marks as an API route, so a stale reply can never stand in for a real one.
  if (url.pathname.startsWith('/api/')) return

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(ASSETS).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(SHELL).then((cache) => cache.put('/', copy))
          }
          return response
        })
        .catch(() =>
          caches
            .match('/')
            .then(
              (hit) =>
                hit ??
                new Response('<h1>Offline</h1><p>Open Onepad once while online to install it.</p>', {
                  headers: { 'Content-Type': 'text/html' },
                  status: 503,
                }),
            ),
        ),
    )
  }
})
