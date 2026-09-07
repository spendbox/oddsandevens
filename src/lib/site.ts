import 'server-only'
import { headers } from 'next/headers'

/**
 * Where this site is, right now.
 *
 * Paystack needs somewhere to send the player back to, and that address has to
 * be the one they are actually on: a Vercel preview, the production domain, or
 * localhost during development. Reading it from the request means nobody has to
 * remember to set a variable per environment — but NEXT_PUBLIC_SITE_URL wins if
 * it is set, for the case where the app sits behind something that rewrites the
 * host.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')

  const head = await headers()
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? 'localhost:3000'
  const protocol = head.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')

  return `${protocol}://${host}`
}
