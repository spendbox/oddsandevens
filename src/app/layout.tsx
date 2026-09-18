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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#191a1d' },
  ],
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
