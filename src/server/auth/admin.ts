import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '../db'
import { ACTIVITY_COOKIE, checkActivity } from './activity'
import { getRateLimitSalt } from './env'
import { createSupabaseServerClient } from './supabase'

/**
 * Admin authorization (ADR-010). A valid Supabase login is NOT enough: the verified user ID must
 * belong to an active row in the `AdminUser` allowlist. Roles or flags in the token
 * (user_metadata / app_metadata) are never trusted.
 *
 * Call `requireAdmin()` in every admin page, Server Action and Route Handler. The proxy only
 * redirects early; it is never the only check.
 */
export type AdminIdentity = { id: string; email: string; displayName: string | null }

export type AdminCheck =
  | { status: 'anonymous' }
  | { status: 'forbidden'; authUserId: string }
  | { status: 'admin'; admin: AdminIdentity }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Allowlist lookup for an already verified Supabase user ID. Exported for tests. */
export async function checkAllowlist(authUserId: string | null | undefined): Promise<AdminCheck> {
  if (!authUserId || !UUID.test(authUserId)) return { status: 'anonymous' }
  const row = await getDb().adminUser.findUnique({
    where: { authUserId },
    select: { id: true, email: true, displayName: true, isActive: true },
  })
  if (!row || !row.isActive) return { status: 'forbidden', authUserId }
  return { status: 'admin', admin: { id: row.id, email: row.email, displayName: row.displayName } }
}

/**
 * Verifies the session with the Supabase Auth server (`getUser()`), not just the cookie:
 * a forged, expired or signed-out token is rejected here even if the JWT still parses.
 */
export async function getAdminCheck(): Promise<AdminCheck> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return { status: 'anonymous' }
  return checkAllowlist(data.user.id)
}

/** For pages and Server Actions: returns the admin or redirects (never renders admin data). */
export async function requireAdmin(nextPath = '/admin'): Promise<AdminIdentity> {
  const check = await getAdminCheck()
  if (check.status === 'admin') {
    // Idle / maximum session time, checked here too so the proxy is never the only check
    // (ADR-052). Read-only: the proxy refreshes the activity cookie.
    if (!(await activityValid()))
      redirect(`/admin/login?expired=1&next=${encodeURIComponent(nextPath)}`)
    return check.admin
  }
  if (check.status === 'forbidden') redirect('/admin/login?error=forbidden')
  redirect(`/admin/login?next=${encodeURIComponent(nextPath)}`)
}

async function activityValid(): Promise<boolean> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getClaims()
  const sessionId = data?.claims?.session_id
  const value = (await cookies()).get(ACTIVITY_COOKIE)?.value
  return (
    checkActivity(value, typeof sessionId === 'string' ? sessionId : undefined, getRateLimitSalt())
      .result === 'ok'
  )
}
