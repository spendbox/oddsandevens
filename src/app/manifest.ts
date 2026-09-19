import type { MetadataRoute } from 'next'
import { APP_NAME, APP_TAGLINE } from '@/lib/app'

/**
 * What makes this a thing you can install rather than a page you visit.
 *
 * With this file plus the service worker, a browser offers Install — its own
 * button in the address bar on a desktop, Add to Home Screen on a phone — and
 * the app then opens from the dock or the home screen in its own window, with
 * no address bar, and starts with no network at all.
 *
 * ## Why the icons are listed twice
 *
 * Chrome will only offer the install at all if the manifest has a PNG of at
 * least 192 and one of at least 512 with `purpose: "any"`. Every icon here
 * was `maskable`, which is a different promise — "crop me to whatever shape
 * this platform uses" — so there was no plain icon to install with and the
 * browser's own button never appeared. They are declared both ways: the same
 * files, once as the icon and once as something safe to crop.
 *
 * The SVG stays because it is sharp at any size on the platforms that take
 * one, and it is a tenth of the bytes.
 *
 * ## Keep this true
 *
 * The name and description are read out on the install prompt and then sit
 * under the icon forever. They described a spreadsheet, a code editor and a
 * form builder for months after all three were taken out of the app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable id, so a change of start_url is not read as a different app
    // by a browser that already has this one installed.
    id: '/',
    name: `${APP_NAME} — ${APP_TAGLINE.toLowerCase()}`,
    short_name: APP_NAME,
    description:
      'Open it and start typing. Every note is saved on your device as you write, searched by every word inside it, and yours with no account at all.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    lang: 'en',
    dir: 'ltr',
    background_color: '#ffffff',
    /*
      The paper colour, because this is what paints the phone's status bar.

      It was the app's green, which is right for a button and wrong for the
      strip at the top of the screen: installed, the app had a green band
      above it carrying the time and the battery, and the page underneath was
      white. An installed app should reach the top of the screen and be one
      surface; the bar is part of the app, not a frame around it.

      A manifest cannot answer two colours, so this is the light one and the
      `themeColor` meta pair in layout.tsx — which a browser prefers over
      this — carries the dark.
    */
    theme_color: '#ffffff',
    categories: ['productivity', 'utilities'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }
}
