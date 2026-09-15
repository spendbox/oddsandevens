'use client'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase is optional here, and loaded lazily — both matter.
 *
 * Optional: Pad's promise is "open it and start typing". If the app needed a
 * configured backend to render, a missing environment variable would turn
 * that into a stack trace. So every reader below reports rather than throws,
 * and "not configured" is a normal state: no sign-in button, everything still
 * saved on the device.
 *
 * Lazy: the client is ~100KB of JavaScript that only matters once somebody
 * signs in. Importing it at the top of the module put it in the first
 * download for every visitor, including the ones who never sign in at all.
 * The dynamic import below moves it to the moment it is actually needed.
 */
function readEnv(): { url: string; key: string } | null {
  // Both the NEXT_PUBLIC_ names and the bare ones are read. A NEXT_PUBLIC_
  // value is compiled into the bundle at build time, so a deployment made
  // before the variable was set cannot see it however long it has been in the
  // dashboard. They are written out in full rather than looked up by a
  // computed key, because the compiler can only substitute what it can
  // literally see.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
  if (!url || !key) return null
  return { url, key }
}

export function isSyncConfigured(): boolean {
  return readEnv() !== null
}

let client: SupabaseClient | null = null
let loading: Promise<SupabaseClient | null> | null = null

/**
 * The Supabase client, or null when sync is not set up or cannot be loaded.
 * Never throws — a failure here costs the user their sync, not their document.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (client) return Promise.resolve(client)
  if (loading) return loading

  const env = readEnv()
  if (!env) return Promise.resolve(null)

  loading = import('@supabase/ssr')
    .then(({ createBrowserClient }) => {
      client = createBrowserClient(env.url, env.key)
      return client
    })
    .catch(() => {
      // A malformed URL, or a chunk that could not be fetched because the
      // device is offline. Either way the app carries on locally.
      loading = null
      return null
    })

  return loading
}
