import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pad',
  description:
    'Notes, spreadsheets, tasks, code and forms in one place. Open it and start typing. Works offline.',
  applicationName: 'Pad',
  appleWebApp: { capable: true, title: 'Pad', statusBarStyle: 'default' },
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
          Runs before first paint so a dark-mode user never sees a white flash.
          It has to be inline and synchronous to beat the paint, which is the
          one thing that justifies a raw script tag in this app.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('pad-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  )
}
