import type { MetadataRoute } from 'next'

/**
 * This is what makes Pad installable — the "web app that can be downloaded"
 * part. With this file plus the service worker, a browser offers Install and
 * the app then opens from the dock or home screen in its own window, with no
 * address bar, and starts with no network at all.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pad — notes, tables, tasks, code, forms',
    short_name: 'Pad',
    description:
      'One place to write, plan, calculate and build. Works offline; sign in only when you want it on another device.',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: '#4f46e5',
    categories: ['productivity', 'utilities'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
