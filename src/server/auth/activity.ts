import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Admin session lifetime (ADR-052). Supabase refresh tokens last for weeks, so on top of them:
 * - every admin cookie is a browser-session cookie (gone when the browser closes);
 * - a signed activity cookie bound to the Supabase session ends the admin session after
 *   30 minutes without activity and 12 hours after sign-in, whatever the browser does
 *   (e.g. "restore previous tabs" keeps session cookies alive).
 * The proxy refreshes the cookie on every admin request; `requireAdmin()` checks it again.
 */
export const ACTIVITY_COOKIE = 'zorko_admin_activity'
export const IDLE_TIMEOUT_MS = 30 * 60_000
export const MAX_SESSION_MS = 12 * 60 * 60_000

export type ActivityCheck = 'ok' | 'missing' | 'invalid' | 'idle' | 'max'

function key(secret: string): Buffer {
  // A sub-key derived from RATE_LIMIT_SALT, so no extra secret has to be configured.
  return createHmac('sha256', secret).update('admin-activity-v1').digest()
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', key(secret)).update(payload).digest('base64url')
}

/** "<sessionId>.<signedInAt>.<lastSeen>.<signature>" (times in ms). */
export function encodeActivity(
  sessionId: string,
  signedInAt: number,
  lastSeen: number,
  secret: string,
): string {
  const payload = `${sessionId}.${signedInAt}.${lastSeen}`
  return `${payload}.${sign(payload, secret)}`
}

export function checkActivity(
  value: string | undefined,
  sessionId: string | undefined,
  secret: string,
  now = Date.now(),
): { result: ActivityCheck; signedInAt?: number } {
  if (!value) return { result: 'missing' }
  const parts = value.split('.')
  if (parts.length !== 4 || !sessionId) return { result: 'invalid' }
  const [sid, iat, seen, mac] = parts as [string, string, string, string]
  const expected = Buffer.from(sign(`${sid}.${iat}.${seen}`, secret))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return { result: 'invalid' }
  // Bound to the Supabase session: a cookie copied from another session is useless.
  if (sid !== sessionId) return { result: 'invalid' }
  const signedInAt = Number(iat)
  const lastSeen = Number(seen)
  if (!Number.isFinite(signedInAt) || !Number.isFinite(lastSeen) || lastSeen > now + 60_000)
    return { result: 'invalid' }
  if (now - signedInAt > MAX_SESSION_MS) return { result: 'max' }
  if (now - lastSeen > IDLE_TIMEOUT_MS) return { result: 'idle' }
  return { result: 'ok', signedInAt }
}

/** Cookie options: HttpOnly, admin paths only, and no Max-Age (deleted when the browser closes). */
export function activityCookieOptions() {
  return {
    httpOnly: true,
    secure: (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://'),
    sameSite: 'lax' as const,
    path: '/admin',
  }
}

type CookieOptions = { maxAge?: number; expires?: Date | number | string; [k: string]: unknown }

/**
 * Turns Supabase's long-lived auth cookies (400 days) into browser-session cookies. Deletions
 * (Max-Age 0 or a past date) are kept as they are, so sign-out still clears them.
 */
export function sessionOnly<T extends CookieOptions | undefined>(options: T): T {
  if (!options) return options
  const deleting =
    options.maxAge === 0 ||
    (options.expires !== undefined && new Date(options.expires).getTime() <= Date.now())
  if (deleting) return options
  const { maxAge: _m, expires: _e, ...rest } = options
  void _m
  void _e
  return rest as T
}

/** `session_id` claim of a Supabase access token (the token was just issued to us by Supabase). */
export function sessionIdFromAccessToken(token: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString())
    return typeof payload.session_id === 'string' ? payload.session_id : undefined
  } catch {
    return undefined
  }
}
