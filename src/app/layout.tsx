import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Commons — find people pursuing what you are pursuing',
    template: '%s · Commons',
  },
  description:
    'An intent network. Join a pursuit, see where everyone is, and meet the people who can help you get there.',
  applicationName: 'Commons',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Commons' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  )
}
