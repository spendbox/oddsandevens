import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Forge — describe a tool, get a tool', template: '%s · Forge' },
  description:
    'Describe the tool you want. Forge builds it, you edit it, and you share it at a link — free or paid.',
  applicationName: 'Forge',
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  )
}
