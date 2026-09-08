import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { readSupabaseEnv } from './lib/supabase/env'

/**
 * Refreshes the Supabase session on every request, and keeps signed-out people
 * out of the parts of Spendbox that belong to a person.
 *
 * Box pages are deliberately not in that set: /b/ABC123 works for anyone with
 * the link, signed in or not, because a link a stranger cannot open is not a
 * share link.
 *
 * This is a convenience, not a security boundary. The check here reads a cookie;
 * every page and route that matters asks Supabase who the user actually is.
 *
 * Which is why nothing in here is allowed to throw. It runs on every request to
 * every route, so an exception on this line is not a broken page — it is a
 * broken site, box links included, and those are the whole distribution
 * mechanism. It threw exactly once, in production, over a setting that was
 * present in the dashboard but not in the build that was serving: every URL on
 * spendbox.site answered with a stack trace. A convenience that cannot be
 * skipped is not a convenience.
 *
 * So when the settings are missing or Supabase cannot be reached, the request
 * goes through untouched and the pages behind decide what to do about it. The
 * worst case is that somebody signed out reaches /home and is bounced by
 * requireProfile() a moment later instead of here — which is the same
 * destination, one hop slower.
 *
 * Named `proxy` rather than `middleware`: Next.js 16 renamed the convention.
 */
const NEEDS_ACCOUNT = ['/home', '/wallet', '/account', '/play', '/admin', '/claim']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const env = readSupabaseEnv()

  if (!env.ok) {
    // Said once per request rather than swallowed: an operator reading the logs
    // needs to know why nobody is being signed in, and /setup says the rest.
    console.warn(`[spendbox] proxy is passing requests straight through: ${env.problem}`)
    return response
  }

  const supabase = createServerClient(env.settings.url, env.settings.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value)
        }
      },
    },
  })

  // Supabase being slow, down, or refusing the cookie must not decide whether
  // the site answers at all. No user simply means no redirect.
  let user = null

  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (error) {
    console.warn(
      `[spendbox] proxy could not reach Supabase: ` +
        (error instanceof Error ? error.message : String(error)),
    )
    return response
  }

  const { pathname, search } = request.nextUrl
  const privatePage = NEEDS_ACCOUNT.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )

  if (!user && privatePage) {
    const url = request.nextUrl.clone()
    url.pathname = '/enter'
    url.search = ''
    url.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(url)
  }

  // Somebody signed in has no business on the sign-in page — unless they were
  // sent there because something went wrong, in which case bouncing them back
  // is a loop with nothing on screen to explain it.
  const reportingProblem = request.nextUrl.searchParams.has('problem')
  if (user && !reportingProblem && pathname === '/enter') {
    const url = request.nextUrl.clone()
    url.pathname = request.nextUrl.searchParams.get('next') ?? '/home'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    // Paystack's webhook is signed, not cookied, and must never be redirected.
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|api/paystack|.*\\.(?:png|jpg|jpeg|svg|gif|webp)$).*)',
  ],
}
