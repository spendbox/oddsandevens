import type { NextConfig } from "next";

/**
 * The one host `next/image` is allowed to fetch from.
 *
 * Sponsor logos and reward stills live in the `sponsors` bucket (0053), which
 * means they arrive as absolute URLs on the Supabase origin — and `next/image`
 * answers 400 for any remote URL not matched here. The pattern is derived from
 * the same environment variable the client is already built with rather than
 * hard-coded, so a fresh project, a branch database and production each allow
 * their own storage and nobody else's.
 *
 * The path is narrowed to the bucket. Everything else in Supabase storage is a
 * bucket this app does not draw, and an optimiser pointed at all of them is a
 * wider door than the feature needs.
 *
 * Wrapped, because a missing or malformed URL must not take the build with it.
 * Note what an empty list actually means, though: not "unoptimised images" but
 * **no sponsor images at all**, because an unmatched remote URL is a 400 from
 * the optimiser rather than a passthrough. So this variable has to be set
 * wherever the config is evaluated — at build time on a platform that bakes
 * it, at server start for a self-hosted `next start`.
 *
 * In practice that is already guaranteed: `NEXT_PUBLIC_SUPABASE_URL` is
 * inlined into the browser bundle for the Supabase client, so a deployment
 * missing it has no working database long before it has a missing logo. The
 * guard is here so a config error degrades to one broken picture instead of a
 * build that won't start.
 */
function sponsorImages(): { protocol: "https" | "http"; hostname: string; pathname: string }[] {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return [];
  try {
    const { protocol, hostname } = new URL(base);
    return [
      {
        protocol: protocol === "http:" ? "http" : "https",
        hostname,
        pathname: "/storage/v1/object/public/sponsors/**",
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: sponsorImages(),
  },
};

export default nextConfig;
