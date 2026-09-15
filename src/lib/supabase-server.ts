import { createClient } from '@supabase/supabase-js'

/**
 * A server-side Supabase client for reading public data.
 *
 * It uses the anonymous key, never the service role. The only thing it reads
 * is `shared_docs`, whose row level security policy already says "anyone may
 * select". Reaching for the service role here would mean a bug in this file
 * could read every private document instead of none of them.
 */
export function publicSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
  // Returns null rather than throwing: a missing variable must not take a
  // public page down with a stack trace.
  if (!url || !key) return null
  try {
    return createClient(url, key, { auth: { persistSession: false } })
  } catch {
    return null
  }
}
