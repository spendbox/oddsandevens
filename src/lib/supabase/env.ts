/**
 * The settings Spendbox needs, read in a way that cannot take the site down.
 *
 * Two things about `NEXT_PUBLIC_` variables in Next.js matter here, and between
 * them they are why this file is more than four lines.
 *
 * The first is that they are compiled in. `process.env.NEXT_PUBLIC_SUPABASE_URL`
 * is replaced with the literal value at build time, in the browser bundle and in
 * the server one — including the proxy's. So a deployment built before the
 * variable existed carries a runtime lookup that Vercel may or may not answer,
 * and a deployment built after it carries the value it had *then*. Adding the
 * variable in the Vercel dashboard changes nothing about a build that has
 * already happened. "It is set" and "this deployment can see it" are different
 * statements, and the error people hit is the gap between them.
 *
 * So each setting has a second name with no `NEXT_PUBLIC_` prefix. Those are
 * never compiled in, which means they are read fresh on every request and take
 * effect the moment they are saved — no redeploy. The browser still needs the
 * public one, because a browser has no process.env to read; the server prefers
 * whichever it can actually see.
 *
 * The second is that this runs on the very first line of the proxy, which runs
 * on every request. Throwing there does not fail one page, it fails the site —
 * including the box links that are the entire point of Spendbox. Hence
 * `readSupabaseEnv()`, which reports rather than throws, and `supabaseEnv()`,
 * which throws and is for the callers entitled to: the ones moving money.
 */

/** Every name that can supply each setting, best first. */
const NAMES = {
  url: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'],
  key: ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'],
} as const

/**
 * Read the settings, spelled out one name at a time.
 *
 * Written as separate literal member accesses on purpose. Next only compiles in
 * a `NEXT_PUBLIC_` variable where it can see the whole expression written out —
 * `process.env[someVariable]` is invisible to it and would silently read
 * nothing in the browser. This is the one place in the app where how the
 * expression is written changes what it does.
 */
function firstOf(setting: keyof typeof NAMES): { name: string; value: string } | null {
  const found =
    setting === 'url'
      ? [
          { name: NAMES.url[0], value: process.env.NEXT_PUBLIC_SUPABASE_URL },
          { name: NAMES.url[1], value: process.env.SUPABASE_URL },
        ]
      : [
          { name: NAMES.key[0], value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
          { name: NAMES.key[1], value: process.env.SUPABASE_ANON_KEY },
        ]

  for (const candidate of found) {
    if (candidate.value && candidate.value.trim()) {
      return { name: candidate.name, value: candidate.value.trim() }
    }
  }

  return null
}

/** Tolerates a pasted URL with stray spaces, a trailing slash, or no https://. */
function tidyUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '')
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    new URL(withScheme)
    return withScheme
  } catch {
    return null
  }
}

export type SupabaseSettings = { url: string; key: string }

export type EnvReport =
  | { ok: true; settings: SupabaseSettings }
  | { ok: false; missing: string[]; problem: string }

/**
 * What this deployment can actually see. Never throws.
 *
 * `missing` names the settings that have no value under any of their names, so
 * a screen can say which one to add rather than "something is not configured".
 */
export function readSupabaseEnv(): EnvReport {
  const url = firstOf('url')
  const key = firstOf('key')

  const missing = [
    ...(url ? [] : [NAMES.url[0]]),
    ...(key ? [] : [NAMES.key[0]]),
  ]

  if (!url || !key) {
    return {
      ok: false,
      missing,
      problem: `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set on this deployment.`,
    }
  }

  const tidied = tidyUrl(url.value)

  if (!tidied) {
    return {
      ok: false,
      missing: [],
      problem:
        `${url.name} is not a valid address (got "${url.value}"). It should look like ` +
        'https://abcdefghijkl.supabase.co — copy it from Supabase under Project Settings → ' +
        'API, as "Project URL".',
    }
  }

  return { ok: true, settings: { url: tidied, key: key.value } }
}

/** Can this deployment talk to Supabase at all? For the callers that would rather do less than fail. */
export function supabaseConfigured(): boolean {
  return readSupabaseEnv().ok
}

/**
 * The settings, or an explanation.
 *
 * For the paths that genuinely cannot carry on without them — anything holding
 * a coin or a payout. Everything else reads the report and degrades.
 */
export function supabaseEnv(): SupabaseSettings {
  const report = readSupabaseEnv()
  if (report.ok) return report.settings

  throw new Error(
    `Spendbox cannot start: ${report.problem}\n\n` +
      'Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY — in Vercel under ' +
      'Settings → Environment Variables, ticking every environment you deploy (Production, ' +
      'Preview and Development), or in a .env.local file when running locally. The values are ' +
      'in Supabase under Project Settings → API (use the "anon"/"publishable" key, never the ' +
      'secret one).\n\n' +
      'A NEXT_PUBLIC_ variable is compiled into the build, so a deployment made before you ' +
      'added it will not pick it up — redeploy. To avoid that entirely, set SUPABASE_URL and ' +
      'SUPABASE_ANON_KEY as well: same values, no prefix, read fresh on every request. ' +
      'Open /setup on this deployment to see what it can currently see.',
  )
}
