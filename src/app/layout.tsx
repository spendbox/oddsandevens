import type { Metadata, Viewport } from 'next'
import { APP_NAME } from '@/lib/app'
import { PREFS_SCRIPT } from '@/lib/ui-prefs'
import './globals.css'

export const metadata: Metadata = {
  title: APP_NAME,
  description:
    'A note-taking app for people who take notes for a living. Open it and start typing. Works offline.',
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: 'default' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom stays available. Locking it is an accessibility failure, and the
  // layout below does not need it locked to hold together.
  maximumScale: 5,
  // viewport-fit lets the app paint under the notch when it is installed.
  viewportFit: 'cover',
  /*
    The keyboard makes the page shorter rather than being drawn over it, where
    a browser supports that. It is half of the fix for a sheet that ended up
    under the keys the moment somebody typed into it; the other half is
    keyboard.ts, for the browsers that ignore this.
  */
  interactiveWidget: 'resizes-content',
  /*
    No `themeColor` here on purpose.

    The strip at the top of a phone — the time, the battery, the signal —
    takes that colour when the app is installed, and there is no static
    value that is right: a light/dark pair answers what the *system* is set
    to, and this app lets somebody choose a theme for itself, so the two
    disagree the moment anybody uses that setting. The result was a white
    bar above a near-black app.

    `PREFS_SCRIPT` writes the tag instead, from the `--color-paper` the
    stylesheet actually resolved, before the first paint and again whenever
    the theme changes either way. A value declared here would be appended
    to the head after that script has run and would be the one some
    browsers picked — one tag, written by the thing that knows.
  */
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Runs before first paint, so a dark-mode user never sees a white flash
          and a collapsed sidebar is never seen swinging shut. It has to be
          inline and synchronous to beat the paint, which is the one thing that
          justifies a raw script tag in this app.
        */}
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  )
}
