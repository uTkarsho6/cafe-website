import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { Client } from 'pg'
import {
  ADMIN,
  TEST_DB,
  USER,
  allowlistTestAdmin,
  asClient,
  hasAccounts,
  signIn,
} from './admin-helpers'

/** Admin authentication E2E (Phase 5A). Account requirements: see admin-helpers.ts. */

// Traces record typed values, including the test password: never keep them for admin specs.
test.use({ trace: 'off' })
test.describe('admin access without signing in (TC-SEC-001, TC-E2E-060)', () => {
  test.beforeEach(({ page }) => asClient(page))

  test('protected URLs redirect to the login page, keeping a safe return path', async ({
    page,
  }) => {
    for (const path of ['/admin', '/admin/menu']) {
      await page.goto(path)
      await expect(page).toHaveURL(new RegExp(`/admin/login\\?next=${encodeURIComponent(path)}$`))
    }
    await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible()
  })

  test('login page: no signup or recovery links, noindex, no-store, accessible', async ({
    page,
  }) => {
    const res = await page.goto('/admin/login')
    expect(res?.headers()['cache-control']).toContain('no-store')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    for (const banned of [/sign ?up/i, /register/i, /forgot/i, /create account/i])
      await expect(page.getByText(banned)).toHaveCount(0)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })

  test('wrong credentials show one generic message (no account enumeration)', async ({ page }) => {
    await signIn(page, 'nobody-here@example.invalid', 'wrong-password-123')
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'Email or password is incorrect.',
    )
    await expect(page).toHaveURL(/\/admin\/login/)
    await expect(page.getByLabel('Password')).toHaveValue('')
  })

  test('an external ?next= is ignored (no open redirect)', async ({ page }) => {
    await page.goto('/admin/login?next=https://evil.example/')
    expect(await page.locator('input[name="next"]').inputValue()).toBe('/admin')
    await page.goto('/admin/login?next=//evil.example')
    expect(await page.locator('input[name="next"]').inputValue()).toBe('/admin')
  })

  test('a forged session cookie is treated as signed out (TC-SEC-003)', async ({
    page,
    context,
  }) => {
    const ref = new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://x.supabase.co',
    ).hostname.split('.')[0]
    const fake = Buffer.from(
      JSON.stringify({ access_token: 'a.b.c', refresh_token: 'x', expires_at: 9999999999 }),
    ).toString('base64url')
    await context.addCookies([
      { name: `sb-${ref}-auth-token`, value: `base64-${fake}`, url: 'http://localhost:3100' },
    ])
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/login\?.*expired=1/)
    await expect(page.getByRole('main').getByText('Your session expired')).toBeVisible()
  })
})

test.describe('login rate limiting (TC-SEC-008)', () => {
  // Chromium only: each attempt also reaches Supabase Auth, which has its own quota.
  test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough')
  test('the 6th attempt for the same account within 15 minutes is refused', async ({ page }) => {
    await asClient(page)
    for (let i = 1; i <= 6; i++) {
      await signIn(page, 'rate-limit-check@example.invalid', `wrong-${i}`)
      const alert = page.getByRole('main').getByRole('alert')
      if (i < 6) await expect(alert).toHaveText('Email or password is incorrect.')
      else await expect(alert).toContainText('Too many sign-in attempts')
    }
  })
})

test.describe('signed-in flows (TC-SEC-002/007/009, TC-E2E-060/061)', () => {
  test.skip(
    !hasAccounts,
    'NOT RUN: set E2E_ADMIN_* and E2E_USER_* in .env.local (Phase 5A prerequisites)',
  )
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(allowlistTestAdmin)
  test.beforeEach(({ page }) => asClient(page))

  test('admin signs in, sees real counts and the audit entry; cookies are HttpOnly', async ({
    page,
    context,
  }) => {
    await signIn(page, ADMIN.email!, ADMIN.password!, '/admin/login?next=/admin')
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    const cards = page.getByTestId('stat-card')
    await expect(cards).toHaveCount(7)
    await expect(cards.filter({ hasText: 'Menu items' })).toContainText('16')
    await expect(cards.filter({ hasText: 'Active offers' })).toContainText('3')
    await expect(page.getByRole('table')).toContainText('Signed in')
    await expect(
      page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Dashboard' }),
    ).toHaveAttribute('aria-current', 'page')
    const auth = (await context.cookies()).filter((c) => c.name.startsWith('sb-'))
    expect(auth.length).toBeGreaterThan(0)
    for (const c of auth) {
      expect(c.httpOnly).toBe(true)
      expect(c.sameSite).toBe('Lax')
    }
  })

  test('a valid Supabase user who is not on the allowlist is refused and signed out', async ({
    page,
    context,
  }) => {
    await signIn(page, USER.email!, USER.password!)
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'Email or password is incorrect.',
    )
    expect((await context.cookies()).filter((c) => c.name.startsWith('sb-'))).toEqual([])
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('logout ends the session; protected URLs redirect again', async ({ page }) => {
    await signIn(page, ADMIN.email!, ADMIN.password!)
    await expect(page).toHaveURL(/\/admin$/)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/admin\/login\?signedOut=1$/)
    await expect(page.getByRole('main').getByText('You have been signed out.')).toBeVisible()
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('session ends with the browser, after idle time, or when the activity cookie is tampered with (ADR-052)', async ({
    page,
    context,
  }) => {
    await signIn(page, ADMIN.email!, ADMIN.password!, '/admin/login?next=/admin')
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    const cookies = await context.cookies()
    const auth = cookies.filter((c) => /^sb-.+-auth-token/.test(c.name))
    const activity = cookies.find((c) => c.name === 'zorko_admin_activity')
    expect(auth.length).toBeGreaterThan(0)
    // Browser-session cookies: no expiry date, so closing the browser signs the admin out.
    for (const c of [...auth, activity!]) expect(c.expires, c.name).toBe(-1)
    expect(activity).toMatchObject({ httpOnly: true, path: '/admin' })

    // A tampered "last seen" time (trying to dodge the idle timeout) ends the session.
    // Leave the admin page first: in-flight background prefetches would otherwise refresh the
    // cookie (from the still-valid value they were sent with) right after we tamper with it.
    await page.goto('about:blank')
    const [sid, iat, , mac] = activity!.value.split('.')
    await context.addCookies([
      { ...activity!, value: `${sid}.${iat}.${Date.now() + 3_600_000}.${mac}` },
    ])
    await page.goto('/admin/menu')
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fmenu&expired=1$/)
    await expect(page.getByText('Your session expired. Please sign in again.')).toBeVisible()
    // The Supabase session itself was signed out, not just hidden.
    expect((await context.cookies()).filter((c) => /^sb-.+-auth-token/.test(c.name))).toEqual([])

    // Same for a missing activity cookie with a still-valid Supabase session.
    await signIn(page, ADMIN.email!, ADMIN.password!, '/admin/login?next=/admin')
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    await page.goto('about:blank') // no admin requests in flight (see above)
    await context.clearCookies({ name: 'zorko_admin_activity' })
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin&expired=1$/)
  })

  test('dashboard visual baselines (TC-VIS, admin dashboard)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'baselines are recorded in Chromium')
    test.skip(process.platform !== 'darwin', 'visual baselines are recorded on macOS')
    // Deterministic activity table: only this sign-in (test database only).
    const db = new Client({ connectionString: TEST_DB })
    await db.connect()
    await db.query('DELETE FROM "AuditLog"')
    await db.end()
    await signIn(page, ADMIN.email!, ADMIN.password!)
    await expect(page).toHaveURL(/\/admin$/)
    for (const [device, width, height] of [
      ['desktop', 1440, 900],
      ['mobile', 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      // Wait for the streamed dashboard, not the "Checking your session" skeleton.
      await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
      await expect(page.getByTestId('stat-card')).toHaveCount(7)
      await page.evaluate(() => document.fonts.ready)
      // Viewport only: the activity table grows with each sign-in, which changes the page height.
      await expect(page).toHaveScreenshot(`admin-dashboard-${device}.png`, {
        fullPage: false,
        // Recent activity (times, number of sign-ins) and the account name differ per run.
        mask: [page.getByRole('table'), page.getByText(/Signed in as|Welcome,/)],
        maxDiffPixelRatio: 0.01,
      })
    }
  })

  test('mobile: the admin menu opens as a drawer with the dashboard and log out', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, ADMIN.email!, ADMIN.password!)
    await page.getByRole('button', { name: 'Open admin menu' }).click()
    const drawer = page.getByRole('dialog', { name: 'Admin menu' })
    await expect(drawer.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Log out' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
