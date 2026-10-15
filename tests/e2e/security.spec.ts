import { expect, request as playwrightRequest, test, type Page } from '@playwright/test'
import { ADMIN, allowlistTestAdmin, asClient, hasAccounts, signIn, testDb } from './admin-helpers'

/**
 * Phase 7 attack tests against the real server (CLAUDE.md §9.10, TC-SEC-001/011/020/090).
 * A real admin Server Action request is captured (and blocked, so it never runs), then replayed:
 * without a session, and with a session but from a foreign origin (CSRF). Nothing may change.
 */
test.describe.configure({ mode: 'serial' })
test.setTimeout(120_000)
test.use({ trace: 'off' }) // traces record typed values, including the test password

type Captured = { url: string; headers: Record<string, string>; body: Buffer }

/** Clicks something that triggers a Server Action and captures the request without sending it. */
async function captureAction(page: Page, trigger: () => Promise<void>): Promise<Captured> {
  let captured: Captured | null = null
  await page.route('**/*', async (route) => {
    const req = route.request()
    if (req.method() === 'POST' && req.headers()['next-action']) {
      // allHeaders() includes the Cookie header the browser would send.
      captured = { url: req.url(), headers: await req.allHeaders(), body: req.postDataBuffer()! }
      return route.abort()
    }
    return route.continue()
  })
  await trigger()
  await expect.poll(() => captured !== null).toBe(true)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  return captured!
}

const availability = (slug: string) =>
  testDb(
    async (db) =>
      (
        await db.query<{ isAvailable: boolean }>(
          `SELECT "isAvailable" FROM "MenuItem" WHERE slug = $1`,
          [slug],
        )
      ).rows[0]!.isAvailable,
  )

test.describe('admin Server Actions cannot be replayed', () => {
  test.skip(!hasAccounts, 'NOT RUN: set E2E_ADMIN_* and E2E_USER_* in .env.local')
  let action: Captured
  let slug: string
  let name: string

  test.beforeAll(async ({ browser, baseURL }) => {
    await allowlistTestAdmin()
    ;({ slug, name } = await testDb(
      async (db) =>
        (
          await db.query<{ slug: string; name: string }>(
            `SELECT slug, name FROM "MenuItem" WHERE "isPublished" AND NOT "isArchived" AND "isAvailable" ORDER BY slug LIMIT 1`,
          )
        ).rows[0]!,
    ))
    const page = await browser.newPage({ baseURL })
    await asClient(page)
    await signIn(page, ADMIN.email!, ADMIN.password!, '/admin/login?next=/admin/menu')
    await expect(page.getByRole('heading', { level: 1, name: 'Menu items' })).toBeVisible()
    await page.goto(`/admin/menu?q=${encodeURIComponent(name)}`)
    const toggle = page.getByRole('switch', { name: `Available: ${name}` })
    await expect(toggle).toBeVisible()
    action = await captureAction(page, () => toggle.click())
    await page.close()
    expect(await availability(slug)).toBe(true) // the captured request never ran
  })

  test('anonymous replay (no session cookies) changes nothing (TC-SEC-001)', async ({
    baseURL,
  }) => {
    const anon = await playwrightRequest.newContext({ baseURL })
    const { cookie: _c, ...headers } = action.headers
    void _c
    const res = await anon.post(action.url, { headers, data: action.body, maxRedirects: 0 })
    expect(res.status()).not.toBe(500)
    expect(await res.text()).not.toContain('is now out of stock')
    expect(await availability(slug)).toBe(true)
    await anon.dispose()
  })

  test('cross-site replay with the admin’s cookies is refused (CSRF, TC-SEC-090)', async ({
    baseURL,
  }) => {
    const ctx = await playwrightRequest.newContext({ baseURL })
    const res = await ctx.post(action.url, {
      headers: { ...action.headers, origin: 'https://evil.example', host: new URL(baseURL!).host },
      data: action.body,
      maxRedirects: 0,
    })
    expect(res.ok()).toBe(false)
    expect(await res.text()).not.toContain('is now out of stock')
    expect(await availability(slug)).toBe(true)

    // Positive control: the very same request from the site's own origin does work, so the
    // refusal above is the Origin check, not a broken replay.
    const ok = await ctx.post(action.url, {
      headers: { ...action.headers, origin: baseURL!, host: new URL(baseURL!).host },
      data: action.body,
      maxRedirects: 0,
    })
    expect(ok.ok()).toBe(true)
    expect(await availability(slug)).toBe(false)
    await testDb((db) =>
      db.query(`UPDATE "MenuItem" SET "isAvailable" = true WHERE slug = $1`, [slug]),
    )
    await ctx.dispose()
  })
})

test.describe('public abuse cases', () => {
  test('oversized request body is refused before the action runs (TC-SEC-011)', async ({
    page,
    baseURL,
  }) => {
    await asClient(page)
    await page.goto('/feedback')
    await page.getByLabel('Your feedback').fill('E2E security size probe message')
    const action = await captureAction(page, () =>
      page.getByRole('button', { name: 'Send feedback' }).click(),
    )
    const ctx = await playwrightRequest.newContext({ baseURL })
    const huge = Buffer.concat([action.body, Buffer.alloc(7 * 1024 * 1024, 'a')])
    const res = await ctx.post(action.url, { headers: action.headers, data: huge, maxRedirects: 0 })
    expect(res.ok()).toBe(false)
    expect([413, 500]).toContain(res.status())
    const stored = await testDb(
      async (db) =>
        (await db.query(`SELECT 1 FROM "Feedback" WHERE message LIKE 'E2E security size%'`))
          .rowCount,
    )
    expect(stored).toBe(0)
    await ctx.dispose()
  })

  test('responses never leak stack traces or internals on bad input', async ({ request }) => {
    for (const path of [
      '/api/v1/menu?page=-1',
      '/api/v1/menu?category=%27%20OR%201%3D1',
      '/api/v1/menu/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '/api/v1/offers/' + 'a'.repeat(5000),
      '/api/v1/qr?format=../../etc',
    ]) {
      const res = await request.get(path)
      expect(res.status(), path).toBeLessThan(500)
      const body = await res.text()
      expect(body, path).not.toMatch(/at \w+ \(|node_modules|prisma|PrismaClient|\.ts:\d+/i)
    }
  })

  test('admin, API and dev routes are not indexable; admin pages are never cached', async ({
    request,
  }) => {
    const robots = await (await request.get('/robots.txt')).text()
    for (const p of ['/admin', '/api/', '/dev/']) expect(robots).toContain(`Disallow: ${p}`)
    const login = await request.get('/admin/login')
    expect(login.headers()['cache-control']).toContain('no-store')
    expect(login.headers()['x-robots-tag']).toContain('noindex')
  })
})
