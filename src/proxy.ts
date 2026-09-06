import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseEnv } from './lib/supabase/env'

/**
 * Refreshes the Supabase session on every request, and keeps signed-out people
 * out of the parts of Forge that belong to a person.
 *
 * Published tools are deliberately not in that set: `/t/...` works for anyone
 * with the link, signed in or not, because distribution is the whole point.
 *
 * Named `proxy` rather than `middleware`: Next.js 16 renamed the convention.
 */
const OWNER_ONLY = ['/new', '/tools', '/build', '/account']

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

  const { pathname } = request.nextUrl
  const needsAccount = OWNER_ONLY.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )

  if (!user && needsAccount) {
    const url = request.nextUrl.clone()
    url.pathname = '/signin'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Somebody signed in has no business on the sign-in page — unless they were
  // sent there because something went wrong, in which case bouncing them back
  // is a loop with nothing on screen to explain it.
  const reportingProblem = request.nextUrl.searchParams.has('problem')
  if (user && !reportingProblem && pathname === '/signin') {
    const url = request.nextUrl.clone()
    url.pathname = '/tools'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|gif|webp)$).*)',
  ],
}
