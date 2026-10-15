import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'
import { Client } from 'pg'

/**
 * Shared admin E2E helpers (Phase 5A/5B). The app server uses the local test database for data
 * and the team's DEVELOPMENT Supabase project for Auth. Tests that sign in need the test
 * accounts in .env.local (E2E_ADMIN_EMAIL/PASSWORD, E2E_USER_EMAIL/PASSWORD); without them they
 * are skipped and reported as NOT RUN. Credentials are never printed.
 */
if (existsSync('.env.local')) process.loadEnvFile('.env.local')
export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL,
  password: process.env.E2E_ADMIN_PASSWORD,
}
export const USER = { email: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD }
export const hasAccounts = Boolean(ADMIN.email && ADMIN.password && USER.email && USER.password)
export const TEST_DB = 'postgresql://zorko_test:zorko_test@127.0.0.1:54329/zorko_test'

/**
 * Each test gets its own client IP (x-forwarded-for is trusted on Vercel, where the edge sets
 * it; see ADR-048), so tests don't share one per-IP login budget.
 */
let ipCounter = 0
export async function asClient(page: Page) {
  ipCounter += 1
  await page.setExtraHTTPHeaders({
    'x-forwarded-for': `198.51.100.${(process.pid % 200) + ipCounter}`,
  })
}

export async function signIn(page: Page, email: string, password: string, path = '/admin/login') {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Allowlists the E2E admin in the TEST database (never in Supabase or the dev database). */
export async function allowlistTestAdmin() {
  const supabase = createClient(
    new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin, // origin only (ADR-048)
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false },
    },
  )
  const { data, error } = await supabase.auth.signInWithPassword({
    email: ADMIN.email!,
    password: ADMIN.password!,
  })
  if (error || !data.user)
    throw new Error(
      `E2E admin account could not sign in: ${error?.code ?? error?.status ?? 'no user'} (check .env.local)`,
    )
  await supabase.auth.signOut({ scope: 'local' })
  const db = new Client({ connectionString: TEST_DB })
  await db.connect()
  await db.query(
    `INSERT INTO "AdminUser" (id, "authUserId", email, "displayName", "isActive", "updatedAt")
     VALUES ($1, $2, $3, 'E2E Admin', true, now())
     ON CONFLICT ("authUserId") DO UPDATE SET "isActive" = true`,
    [randomUUID(), data.user.id, ADMIN.email!.toLowerCase()],
  )
  await db.end()
}

/** Runs SQL against the throwaway test database. */
export async function testDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: TEST_DB })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}
