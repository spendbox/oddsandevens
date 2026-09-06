import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env'

/**
 * The service-role client. It bypasses row level security, so it is used in
 * exactly one place: marking a purchase paid, after Paystack has confirmed the
 * money arrived.
 *
 * Nothing a browser can reach may complete a payment — that is the whole point
 * of the purchases policies. This key must never be exposed to a browser, which
 * is why it has no NEXT_PUBLIC_ prefix and this module is server-only.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!key || !key.trim()) {
    throw new Error(
      'Paid tools need SUPABASE_SERVICE_ROLE_KEY. Copy the "service_role"/"secret" key from ' +
        'Supabase → Project Settings → API and add it in Vercel under Settings → Environment ' +
        'Variables, then redeploy. Keep it server-side: never give it a NEXT_PUBLIC_ prefix. ' +
        'Free tools work without it.',
    )
  }

  const { url } = supabaseEnv()
  return createClient(url, key.trim(), { auth: { persistSession: false } })
}

export function adminConfigured() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}
