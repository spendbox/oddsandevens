import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Box pictures are uploaded through a Server Action, and the default body
    // cap is 1MB — smaller than a photo straight off a phone. The browser
    // shrinks images before sending (see image-picker.tsx), so this is the
    // ceiling for something that slipped past that, not the usual size.
    serverActions: { bodySizeLimit: '5mb' },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
}

export default nextConfig
