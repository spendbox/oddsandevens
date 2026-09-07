import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Spendbox — beat the pattern, take the box', template: '%s · Spendbox' },
  description:
    'Drop a ₦100,000 box, share the link, and watch people try to beat ten patterns against the clock. Beat one and you and the creator are both paid.',
  applicationName: 'Spendbox',
}

export const viewport: Viewport = {
  themeColor: '#07040f',
  width: 'device-width',
  initialScale: 1,
  // The game is a grid of tap targets. Pinch-zooming mid-round is never wanted.
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  )
}
