import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ADMIN, allowlistTestAdmin, asClient, hasAccounts, signIn, testDb } from './admin-helpers'

/**
 * Phase 6: QR menu, public feedback with abuse protection, moderation (TC-E2E-042/043/044/073).
 * Runs after the other admin suites because it writes feedback to the shared test database.
 */
test.describe.configure({ mode: 'serial' })
test.setTimeout(120_000)
test.use({ trace: 'off' }) // traces record typed values, including the test password

const XSS = 'E2E <img src=x onerror="window.__xss=1"> great masala fries!'

test.afterAll(async () => {
  await testDb((db) => db.query(`DELETE FROM "Feedback" WHERE message LIKE 'E2E %'`))
})

async function submitFeedback(page: Page, message: string, name?: string) {
  await page.goto('/feedback')
  await expect(page.getByRole('heading', { level: 1, name: 'Feedback' })).toBeVisible()
  if (name) await page.getByLabel('Your name or nickname (optional)').fill(name)
  await page.getByLabel('Your feedback').fill(message)
  await page.getByRole('button', { name: 'Send feedback' }).click()
}

const rows = (message: string) =>
  testDb(
    async (db) =>
      (
        await db.query<{ status: string }>(`SELECT status FROM "Feedback" WHERE message = $1`, [
          message,
        ])
      ).rows,
  )

test.describe('public: QR menu', () => {
  test('shows a working QR code for the configured menu URL, with PNG and SVG downloads', async ({
    page,
    request,
    baseURL,
  }) => {
    await page.goto('/qr')
    const target = `${baseURL}/menu?src=qr`
    await expect(page.getByText(target)).toBeVisible()
    const img = page.getByTestId('qr-image')
    await expect(img).toBeVisible()
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)

    const png = await request.get('/api/v1/qr?format=png&download=1')
    expect(png.headers()['content-type']).toBe('image/png')
    expect(png.headers()['content-disposition']).toContain('zorko-sangli-menu-qr.png')
    expect([...(await png.body()).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    const svg = await request.get('/api/v1/qr?format=svg')
    expect(svg.headers()['content-type']).toContain('image/svg+xml')
    expect(await svg.text()).toMatch(/^<svg/)

    // Table cards (ADR-061): a valid table gets its own file name; anything else is refused.
    const table = await request.get('/api/v1/qr?format=png&table=12&download=1')
    expect(table.status()).toBe(200)
    expect(table.headers()['content-disposition']).toContain('zorko-sangli-table-12-qr.png')
    for (const bad of ['0', '21', 'abc', '1;drop', '../1'])
      expect((await request.get(`/api/v1/qr?format=svg&table=${bad}`)).status(), bad).toBe(400)

    // The destination opens the menu with no login.
    await page.goto(target)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page).toHaveURL(/\/menu\?src=qr$/)
    await expect(page.getByTestId('menu-card').first()).toBeVisible()
  })
})

test.describe('public: feedback form', () => {
  test('valid feedback is stored as pending and is not public', async ({ page }) => {
    await asClient(page)
    await submitFeedback(page, XSS, 'E2E Guest')
    await expect(page.getByRole('status')).toContainText('Thanks! Your feedback will appear')
    expect(await rows(XSS)).toEqual([{ status: 'PENDING' }])
    await page.goto('/')
    await expect(page.getByText('great masala fries')).toHaveCount(0)
  })

  test('validation errors keep the typed text', async ({ page }) => {
    await asClient(page)
    await submitFeedback(page, 'too short', 'E2E Name')
    await expect(page.getByText('Please write at least 10 characters.')).toBeVisible()
    await expect(page.getByLabel('Your feedback')).toHaveValue('too short')
  })

  test('honeypot: a bot that fills the hidden field gets "thanks" but nothing is stored', async ({
    page,
  }) => {
    await asClient(page)
    await page.goto('/feedback')
    await page
      .locator('#website')
      .evaluate((el: HTMLInputElement) => (el.value = 'http://spam.example'))
    await page.getByLabel('Your feedback').fill('E2E buy cheap watches now')
    await page.getByRole('button', { name: 'Send feedback' }).click()
    await expect(page.getByRole('status')).toContainText('Thanks!')
    expect(await rows('E2E buy cheap watches now')).toEqual([])
  })

  test('rate limit: the 4th submission from one IP within 10 minutes is refused', async ({
    page,
  }) => {
    await asClient(page)
    for (let i = 1; i <= 3; i++) {
      await submitFeedback(page, `E2E flood message number ${i}`)
      await expect(page.getByRole('status')).toContainText('Thanks!')
    }
    await submitFeedback(page, 'E2E flood message number 4')
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'Too many submissions. Please try again in a few minutes.',
    )
    expect(await rows('E2E flood message number 4')).toEqual([])
  })
})

test.describe('admin: moderation and QR', () => {
  test.skip(!hasAccounts, 'NOT RUN: set E2E_ADMIN_* and E2E_USER_* in .env.local')
  test.beforeAll(allowlistTestAdmin)
  test.beforeEach(async ({ page }) => {
    await asClient(page)
    await signIn(page, ADMIN.email!, ADMIN.password!, '/admin/login?next=/admin/feedback')
    await expect(page.getByRole('heading', { level: 1, name: 'Feedback' })).toBeVisible()
  })

  test('approve shows it on the home page as plain text (XSS not executed); reject hides it; delete', async ({
    page,
  }) => {
    const row = page.getByTestId('feedback-row').filter({ hasText: 'great masala fries' })
    await expect(row).toBeVisible()
    await expect(row.getByText(XSS)).toBeVisible() // shown literally to the admin, not as HTML
    await row.getByRole('button', { name: /^Approve/ }).click()
    await expect(page.getByText('Approved: now shown publicly.')).toBeVisible()

    const home = await page.context().newPage()
    await expect(async () => {
      await home.goto('/')
      await expect(home.getByText(XSS, { exact: false }).first()).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 15_000 })
    expect(
      await home.evaluate(() => (window as unknown as { __xss?: number }).__xss),
    ).toBeUndefined()
    await expect(home.locator('main img[src="x"]')).toHaveCount(0)

    await page.goto('/admin/feedback?status=approved')
    await page
      .getByTestId('feedback-row')
      .filter({ hasText: 'great masala fries' })
      .getByRole('button', { name: /^Reject/ })
      .click()
    await expect(page.getByText('Rejected: not shown publicly.')).toBeVisible()
    await expect(async () => {
      await home.goto('/')
      await expect(home.getByText('great masala fries')).toHaveCount(0, { timeout: 2_000 })
    }).toPass({ timeout: 15_000 })

    await page.goto('/admin/feedback?status=rejected')
    await page
      .getByTestId('feedback-row')
      .filter({ hasText: 'great masala fries' })
      .getByRole('button', { name: /^Delete/ })
      .click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently' }).click()
    await expect(page.getByText('Feedback deleted.')).toBeVisible()
    expect(await rows(XSS)).toEqual([])

    const audit = await testDb(
      async (db) =>
        (
          await db.query<{ action: string; summary: string }>(
            `SELECT action, summary FROM "AuditLog" WHERE "entityType" = 'feedback' ORDER BY "createdAt"`,
          )
        ).rows,
    )
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['APPROVE', 'REJECT', 'DELETE']),
    )
    expect(audit.some((a) => a.summary.includes('masala'))).toBe(false) // no guest text in logs
  })

  test('admin QR page shows the code and warns that localhost cannot be printed', async ({
    page,
  }) => {
    await page.goto('/admin/qr')
    await expect(page.getByRole('heading', { level: 1, name: 'QR codes' })).toBeVisible()
    await expect(page.getByRole('main').getByRole('alert')).toContainText('localhost')
    await expect(page.getByTestId('qr-image')).toBeVisible()
    // Table cards 1–20 (ADR-061), each with its own downloads and a working code image.
    await expect(page.getByTestId('table-card')).toHaveCount(20)
    await expect(page.getByText('Table 20', { exact: true })).toBeVisible()
    const card = page.getByRole('img', { name: /QR code for table 20:/ })
    await card.scrollIntoViewIfNeeded()
    await expect
      .poll(() => card.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth))
      .toBeGreaterThan(0)
    await expect(
      page.getByRole('link', { name: 'Download table 20 QR code as PNG' }),
    ).toHaveAttribute('href', '/api/v1/qr?format=png&table=20&download=1')
    await expect(page.getByRole('button', { name: 'Print all 20 cards' })).toBeVisible()
  })

  test('Phase 6 pages are accessible (axe) and have no horizontal scroll', async ({ page }) => {
    for (const path of ['/feedback', '/qr', '/admin/feedback', '/admin/qr']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(
        results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
        path,
      ).toEqual([])
      for (const width of [375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        )
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0)
      }
      await page.setViewportSize({ width: 1280, height: 720 })
    }
  })

  test('visual baselines: feedback moderation, feedback form, QR page (TC-VIS)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'baselines are recorded in Chromium')
    test.skip(process.platform !== 'darwin', 'visual baselines are recorded on macOS')
    await testDb(async (db) => {
      await db.query(`DELETE FROM "Feedback"`)
      await db.query(
        `INSERT INTO "Feedback" (id, "displayName", message, status, "updatedAt") VALUES
         ('e2efeedback0000000000001', 'E2E Priya', 'E2E The cold coffee was perfect after college.', 'PENDING', now()),
         ('e2efeedback0000000000002', NULL, 'E2E Please add more Jain options to the menu.', 'PENDING', now())`,
      )
    })
    for (const [device, width, height] of [
      ['desktop', 1440, 900],
      ['mobile', 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      for (const [name, path, ready] of [
        ['admin-feedback', '/admin/feedback', () => page.getByTestId('feedback-row').first()],
        ['feedback-form', '/feedback', () => page.getByRole('button', { name: 'Send feedback' })],
        ['qr-page', '/qr', () => page.getByTestId('qr-image')],
      ] as const) {
        await page.goto(path)
        await expect(ready()).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await expect(page).toHaveScreenshot(`${name}-${device}.png`, {
          fullPage: false,
          mask: [page.getByText(/Signed in as/), page.locator('[data-volatile]')],
          maxDiffPixelRatio: 0.01,
        })
      }
    }
  })
})
