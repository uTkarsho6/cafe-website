'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { safeAdminNext } from '@/lib/auth/redirect'
import { checkAllowlist, getAdminCheck } from '@/server/auth/admin'
import { createSupabaseServerClient } from '@/server/auth/supabase'
import { recordAudit } from '@/server/audit'
import { clientIp } from '@/server/client-ip'
import { getDb } from '@/server/db'
import { log } from '@/server/log'
import { RULES, hitRateLimit } from '@/server/rate-limit'

export type LoginState = { error: string | null; email: string }

/** Same message for unknown email, wrong password and non-admin accounts (no enumeration). */
const GENERIC = 'Email or password is incorrect.'

const loginSchema = z
  .object({
    email: z.email().max(254),
    password: z.string().min(1).max(128),
    next: z.string().max(300).optional(),
  })
  .strip() // any extra field (e.g. role=admin) is dropped, never trusted

/** Admin sign-in (Server Action: POST-only, Origin-checked by Next.js, ADR-011). */
export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form))
  const email = typeof form.get('email') === 'string' ? String(form.get('email')).trim() : ''
  if (!parsed.success) return { error: GENERIC, email }
  const normalized = parsed.data.email.toLowerCase()

  const ip = await clientIp()
  const [perIp, perAccount] = await Promise.all([
    hitRateLimit(RULES.loginPerIp, [ip]),
    hitRateLimit(RULES.loginPerAccount, [ip, normalized]),
  ])
  if (!perIp.allowed || !perAccount.allowed) {
    const minutes = Math.ceil(Math.max(perIp.retryAfterSec, perAccount.retryAfterSec) / 60)
    log('warn', 'admin.login_rate_limited', {})
    return {
      error: `Too many sign-in attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      email,
    }
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalized,
    password: parsed.data.password,
  })
  if (error || !data.user) return { error: GENERIC, email }

  const check = await checkAllowlist(data.user.id)
  if (check.status !== 'admin') {
    // Valid Supabase account but not an allowlisted admin: end the session at once.
    await supabase.auth.signOut({ scope: 'local' })
    await recordAudit({
      adminUserId: null,
      action: 'LOGIN_REFUSED',
      entityType: 'session',
      summary: 'Sign-in refused: account is not an active admin',
    })
    return { error: GENERIC, email }
  }

  await getDb().adminUser.update({
    where: { id: check.admin.id },
    data: { lastLoginAt: new Date() },
  })
  await recordAudit({
    adminUserId: check.admin.id,
    action: 'LOGIN',
    entityType: 'session',
    summary: 'Signed in',
  })
  redirect(safeAdminNext(parsed.data.next))
}

/** Sign out (POST Server Action). Revokes this session's refresh token and clears cookies. */
export async function logoutAction(): Promise<void> {
  const check = await getAdminCheck()
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: 'local' })
  if (check.status === 'admin') {
    await recordAudit({
      adminUserId: check.admin.id,
      action: 'LOGOUT',
      entityType: 'session',
      summary: 'Signed out',
    })
  }
  redirect('/admin/login?signedOut=1')
}
