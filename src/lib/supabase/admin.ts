import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env'

/**
 * The service-role client. It ignores row level security, which is exactly why
 * every decision that matters is made through it and nowhere else: spending a
 * coin, handing out a pattern, judging an answer, crowning a winner, crediting
 * a payment.
 *
 * The policies in supabase/migrations/0002_policies.sql leave a browser with no
 * way to do any of those. This key is the other half of that arrangement, so it
 * must never reach a browser — hence no NEXT_PUBLIC_ prefix, and hence
 * 'server-only' at the top of this file, which turns a stray client-side import
 * into a build error rather than a leak.
 *
 * Unlike the old app, Spendbox does not work without it. There is no part of
 * the game that a browser is trusted to run.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!key || !key.trim()) {
    throw new Error(
      'Spendbox cannot run without SUPABASE_SERVICE_ROLE_KEY. Copy the "service_role"/"secret" ' +
        'key from Supabase → Project Settings → API and add it in Vercel under Settings → ' +
        'Environment Variables, then redeploy. Keep it server-side: never give it a ' +
        'NEXT_PUBLIC_ prefix.',
    )
  }

  const { url } = supabaseEnv()
  return createClient(url, key.trim(), { auth: { persistSession: false } })
}

/**
 * Is the service-role key present?
 *
 * For the few places that would rather do less than fail. Anything that moves
 * money still calls supabaseAdmin() directly and is entitled to throw — a
 * payment must never be quietly skipped because a key is missing.
 */
export function adminConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}
