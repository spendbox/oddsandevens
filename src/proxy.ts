import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseEnv } from './lib/supabase/env'

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
 * Named `proxy` rather than `middleware`: Next.js 16 renamed the convention.
 */
const NEEDS_ACCOUNT = ['/home', '/wallet', '/account', '/play', '/admin']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { url: supabaseUrl, key: supabaseKey } = supabaseEnv()

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

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
