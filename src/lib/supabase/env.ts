/**
 * The settings Forge needs, checked once and reported in words.
 *
 * Supabase's own failure for a missing URL is "Invalid supabaseUrl", which
 * names neither the setting nor where it goes. Anyone deploying hits that
 * before anything else, so it is worth answering properly.
 */
function missing(name: string): never {
  throw new Error(
    `Forge cannot start: ${name} is not set.\n\n` +
      'Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY — in Vercel under ' +
      'Settings → Environment Variables, or in a .env.local file when running locally. ' +
      'The values are in Supabase under Project Settings → API (use the "anon"/"publishable" ' +
      'key, never the secret one).\n\n' +
      'On Vercel these are read when the site is built, so redeploy after adding them.',
  )
}

/** Tolerates a pasted URL with stray spaces, a trailing slash, or no https://. */
function tidyUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    new URL(withScheme)
  } catch {
    throw new Error(
      `Forge cannot start: NEXT_PUBLIC_SUPABASE_URL is not a valid address (got "${raw}").\n\n` +
        'It should look like https://abcdefghijkl.supabase.co — copy it from Supabase under ' +
        'Project Settings → API, as "Project URL".',
    )
  }

  return withScheme
}

export function supabaseEnv(): { url: string; key: string } {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!rawUrl || !rawUrl.trim()) missing('NEXT_PUBLIC_SUPABASE_URL')
  if (!rawKey || !rawKey.trim()) missing('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  return { url: tidyUrl(rawUrl), key: rawKey.trim() }
}
