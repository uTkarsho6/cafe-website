import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sessionOnly } from './activity'
import { getAuthEnv } from './env'

/**
 * Supabase client bound to this request's cookies (official @supabase/ssr pattern).
 * Session cookies are HttpOnly (set only by the server), Secure on https, SameSite=Lax.
 * In Server Components cookies are read-only, so writes there are ignored; the proxy and
 * Server Actions persist refreshed tokens.
 */
export async function createSupabaseServerClient() {
  const { supabaseUrl, supabaseKey } = getAuthEnv()
  const store = await cookies()
  return createServerClient(supabaseUrl, supabaseKey, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, sessionOnly(options)) // browser-session cookies (ADR-052)
        } catch {
          // Called from a Server Component: cookies are read-only there (see the proxy).
        }
      },
    },
  })
}

export function authCookieOptions() {
  const secure = (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://')
  return { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' }
}
