import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  ACTIVITY_COOKIE,
  activityCookieOptions,
  checkActivity,
  encodeActivity,
  sessionOnly,
} from './server/auth/activity'

/**
 * Admin proxy (Next.js 16 `proxy`, formerly `middleware`). It refreshes the Supabase session
 * cookie and sends visitors without a valid session to the login page. It is a convenience,
 * NOT the security boundary: every admin page and action still calls `requireAdmin()` (ADR-010).
 */
export async function proxy(request: NextRequest) {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  const url = raw && URL.canParse(raw) ? new URL(raw).origin : undefined // origin only (ADR-048)
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const isLogin = request.nextUrl.pathname === '/admin/login'
  if (!url || !key) return isLogin ? NextResponse.next() : toLogin(request, false)

  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      secure: (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://'),
      sameSite: 'lax',
      path: '/',
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of toSet)
          response.cookies.set(name, value, sessionOnly(options))
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v)
      },
    },
  })
  // Do not run other code between creating the client and getClaims() (Supabase guidance).
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims?.sub)

  if (!signedIn && !isLogin) {
    const hadSession = request.cookies.getAll().some((c) => /^sb-.+-auth-token/.test(c.name))
    return withCookies(toLogin(request, hadSession), response)
  }
  if (signedIn && !isLogin) {
    // Idle / maximum session time (ADR-052). Missing salt = misconfiguration: fail closed.
    const secret = process.env.RATE_LIMIT_SALT?.trim() ?? ''
    const sessionId =
      typeof data?.claims?.session_id === 'string' ? data.claims.session_id : undefined
    const now = Date.now()
    const check = secret
      ? checkActivity(request.cookies.get(ACTIVITY_COOKIE)?.value, sessionId, secret, now)
      : { result: 'invalid' as const }
    if (check.result !== 'ok') {
      await supabase.auth.signOut({ scope: 'local' }) // clears the auth cookies via setAll
      const redirect = withCookies(toLogin(request, true), response)
      redirect.cookies.set(ACTIVITY_COOKIE, '', { ...activityCookieOptions(), maxAge: 0 })
      return redirect
    }
    response.cookies.set(
      ACTIVITY_COOKIE,
      encodeActivity(sessionId!, check.signedInAt!, now, secret),
      activityCookieOptions(),
    )
  }
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

function toLogin(request: NextRequest, expired: boolean) {
  const target = new URL('/admin/login', request.url)
  target.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
  if (expired) target.searchParams.set('expired', '1')
  return NextResponse.redirect(target)
}

/** Keep any refreshed/cleared auth cookies when returning a different response. */
function withCookies(target: NextResponse, source: NextResponse) {
  for (const c of source.cookies.getAll()) target.cookies.set(c)
  return target
}

export const config = { matcher: ['/admin', '/admin/:path*'] }
