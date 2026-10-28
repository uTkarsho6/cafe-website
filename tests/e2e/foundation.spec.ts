import { expect, test } from '@playwright/test'

test.describe('Foundation (Phase 2)', () => {
  test('GET /api/health returns ok JSON without caching or internals (NFR-007)', async ({
    request,
  }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/json')
    expect(res.headers()['cache-control']).toContain('no-store')
    const body = await res.json()
    // Phase 3 adds the database round-trip (`db`), as planned in TRD §6.
    expect(Object.keys(body).sort()).toEqual(['db', 'status', 'time', 'version'])
    expect(body.status).toBe('ok')
    expect(body.db).toBe('ok')
  })

  test('health is evaluated per request, not prerendered at build', async ({ request }) => {
    const a = (await (await request.get('/api/health')).json()).time
    await new Promise((r) => setTimeout(r, 20))
    const b = (await (await request.get('/api/health')).json()).time
    expect(a).not.toBe(b)
  })

  test('home page renders with no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto('/')
    // Phase 4A replaced the Phase 2 placeholder with the real homepage (UI_SPEC §12.1).
    await expect(
      page.getByRole('heading', { level: 1, name: /Bite Into Joy at ZORKO Sangli/ }),
    ).toBeVisible()
    await expect(page).toHaveTitle('ZORKO Sangli — Digital Menu, Offers & Café Info')
    expect(errors).toEqual([])
  })

  test('fonts: headings use Inter, body uses DM Sans (self-hosted, ADR-060)', async ({ page }) => {
    const external: string[] = []
    page.on('request', (r) => {
      if (!r.url().startsWith('http://localhost')) external.push(r.url())
    })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const h1Font = await page
      .getByRole('heading', { level: 1 })
      .evaluate((el) => getComputedStyle(el).fontFamily)
    const bodyFont = await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily)
    expect(h1Font.toLowerCase()).toContain('inter')
    expect(bodyFont.toLowerCase()).toContain('dm sans')
    expect(
      await page.evaluate(
        () =>
          document.fonts.check('800 32px Sora') ||
          [...document.fonts].some(
            (f) => f.family.toLowerCase().includes('sora') && f.status === 'loaded',
          ),
      ),
    ).toBe(true)
    expect(external, 'no requests to third-party hosts (fonts/CDNs)').toEqual([])
  })

  test('unknown routes return the branded 404 page with status 404 (FR-025)', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist')
    expect(res?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/')
  })

  for (const path of ['/', '/api/health', '/api/v1/menu', '/does-not-exist']) {
    test(`security headers on ${path} (TC-SEC-110, TC-SEC-111)`, async ({ request }) => {
      const res = await request.get(path)
      const h = res.headers()
      expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
      expect(h['content-security-policy']).toContain("object-src 'none'")
      expect(h['content-security-policy']).not.toContain('unsafe-eval')
      expect(h['x-content-type-options']).toBe('nosniff')
      expect(h['x-frame-options']).toBe('DENY')
      expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
      expect(h['permissions-policy']).toContain('camera=()')
      // The E2E server is plain http://localhost, so HSTS and request upgrading must be absent
      // (Safari would otherwise break every asset). https behaviour is unit-tested.
      expect(h['strict-transport-security']).toBeUndefined()
      expect(h['content-security-policy']).not.toContain('upgrade-insecure-requests')
      expect(h['x-powered-by']).toBeUndefined()
      expect(h['access-control-allow-origin']).toBeUndefined()
    })
  }

  test('home page loads inside a frame is refused by policy headers', async ({ request }) => {
    const res = await request.get('/')
    expect(res.headers()['x-frame-options']).toBe('DENY')
  })
})
