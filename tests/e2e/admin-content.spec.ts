import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import { ADMIN, allowlistTestAdmin, asClient, hasAccounts, signIn, testDb } from './admin-helpers'

/**
 * Offers, banners, café info and gallery administration E2E (Phase 5C, TC-E2E-071/072).
 * Banner and gallery rows without uploads are inserted directly (bundled stock image), so their
 * editing is tested even when Storage is not configured; real uploads need SUPABASE_SECRET_KEY.
 */
test.skip(!hasAccounts, 'NOT RUN: set E2E_ADMIN_* and E2E_USER_* in .env.local')
test.describe.configure({ mode: 'serial' })
test.setTimeout(120_000)
// Traces record typed values, including the test password: never keep them for admin specs.
test.use({ trace: 'off' })

const STOCK = 'stock/burger-tikki.webp'
let cafeBackup: Record<string, unknown> | null = null

test.beforeAll(async () => {
  await allowlistTestAdmin()
  await testDb(async (db) => {
    cafeBackup = (await db.query('SELECT phone, "contactVerified" FROM "CafeInformation"')).rows[0]
    await db.query(
      `INSERT INTO "PromotionalBanner" (id, title, "imagePath", "altText", "isPublished", "sortOrder", "updatedAt")
       VALUES ('e2ebanner000000000000001', 'E2E Banner', $1, 'E2E banner image', true, 0, now())
       ON CONFLICT (id) DO NOTHING`,
      [STOCK],
    )
    await db.query(
      `INSERT INTO "GalleryImage" (id, "storagePath", "altText", "isPublished", "sortOrder", "updatedAt")
       VALUES ('e2egallery00000000000001', $1, 'E2E photo one', true, 0, now()),
              ('e2egallery00000000000002', $1, 'E2E photo two', true, 1, now())
       ON CONFLICT (id) DO NOTHING`,
      [STOCK],
    )
  })
})

test.afterAll(async () => {
  await testDb(async (db) => {
    await db.query(`DELETE FROM "Offer" WHERE title LIKE 'E2E %'`)
    await db.query(`DELETE FROM "PromotionalBanner" WHERE title LIKE 'E2E %'`)
    await db.query(`DELETE FROM "GalleryImage" WHERE "altText" LIKE 'E2E %'`)
    if (cafeBackup)
      await db.query(`UPDATE "CafeInformation" SET phone = $1, "contactVerified" = $2`, [
        cafeBackup.phone,
        cafeBackup.contactVerified,
      ])
  })
})

test.beforeEach(async ({ page }) => {
  await asClient(page)
  await signIn(page, ADMIN.email!, ADMIN.password!, '/admin/login?next=/admin/offers')
  await expect(page.getByRole('heading', { level: 1, name: 'Offers & combos' })).toBeVisible()
})

/** Polls a public page (fresh request each time) until it shows the change (budget 15 s; each check waits up to 2 s for streamed content). */
async function expectPublic(page: Page, path: string, check: (p: Page) => Promise<void>) {
  const pub = await page.context().newPage()
  await expect(async () => {
    await pub.goto(path)
    await check(pub)
  }).toPass({ timeout: 15_000, intervals: [500, 1_000, 2_000] })
  await pub.close()
}

const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true })

test('offer: create combo → public, expire now → hidden, delete (with audit)', async ({ page }) => {
  const title = `E2E Combo ${Date.now() % 100000}`
  // Warm the public offers page first (regression for stale pages after create, ADR-050).
  const warm = await page.context().newPage()
  await warm.goto('/offers')
  await expect(warm.getByRole('heading', { level: 1 })).toBeVisible()
  // Let the warm render finish writing its cache entry. A render still in flight when the admin
  // saves can keep the old copy until its 30 s window ends (ADR-050); this test checks the
  // on-demand path, which is near-instant.
  await warm.waitForTimeout(2_000)
  await warm.close()
  await page.getByRole('link', { name: 'New offer' }).click()
  await field(page, 'Title').fill(title)
  await field(page, 'Description').fill('Two dishes together at one price.')
  await field(page, 'Offer price (₹)').fill('149')
  await page.locator('input[name^="qty_"]').first().fill('1') // first menu item, quantity 1
  await page.getByRole('checkbox', { name: /^Published/ }).check()
  await page.getByRole('button', { name: 'Create offer' }).click()
  await expect(page).toHaveURL(/\/admin\/offers\/[a-z0-9]+\?created=1$/, { timeout: 15_000 })
  await expect(page.getByText('Active', { exact: true }).filter({ visible: true })).toBeVisible()

  await expectPublic(page, '/offers', async (p) => {
    await expect(p.getByRole('main').getByRole('heading', { name: title })).toBeVisible({
      timeout: 2_000,
    })
  })

  await page.getByRole('button', { name: 'Expire now' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Expire now' }).click()
  await expect(page.getByText('Offer expired: hidden from the public site.')).toBeVisible()
  await expectPublic(page, '/offers', async (p) => {
    await expect(p.getByRole('main').getByRole('heading', { name: title })).toHaveCount(0, {
      timeout: 2_000,
    })
  })

  await page.getByRole('button', { name: 'Delete offer' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently' }).click()
  await expect(page).toHaveURL(/\/admin\/offers\?deleted=1$/, { timeout: 15_000 })

  const actions = await testDb(async (db) =>
    (
      await db.query<{ action: string }>(
        `SELECT action FROM "AuditLog" WHERE summary LIKE $1 ORDER BY "createdAt"`,
        [`%${title}%`],
      )
    ).rows.map((r) => r.action),
  )
  expect(actions).toEqual(['CREATE', 'ARCHIVE', 'DELETE'])
})

test('offer: date and price rules are enforced on the server', async ({ page }) => {
  await page.getByRole('link', { name: 'New offer' }).click()
  await field(page, 'Title').fill('E2E Invalid offer')
  await field(page, 'Description').fill('This offer has invalid dates.')
  await field(page, 'Offer price (₹)').fill('0')
  await page.getByLabel('Ends (India time)').fill('2025-01-01T10:00')
  await page.getByRole('button', { name: 'Create offer' }).click()
  await expect(page.getByText('Ends must be after Starts.')).toBeVisible()
  await expect(page.getByText('Offer price: enter rupees above ₹0, e.g. 199.')).toBeVisible()
  await expect(page.getByText('A combo needs at least one menu item.')).toBeVisible()
  await expect(field(page, 'Title')).toHaveValue('E2E Invalid offer')
})

test('banner: javascript: link refused; safe internal link saved and shown on home', async ({
  page,
}) => {
  await page.goto('/admin/banners/e2ebanner000000000000001')
  await field(page, 'Button text').fill('See offers')
  await field(page, 'Button link').fill('javascript:alert(document.cookie)')
  await page.getByRole('button', { name: 'Save banner' }).click()
  await expect(
    page.getByText('Button link: use a page of this site (e.g. /offers) or an https:// address.'),
  ).toBeVisible()

  await field(page, 'Button link').fill('/offers')
  await page.getByRole('button', { name: 'Save banner' }).click()
  await expect(page.getByText('Banner saved.')).toBeVisible()
  await expectPublic(page, '/', async (p) => {
    const link = p.getByRole('main').getByRole('link', { name: 'See offers' })
    await expect(link).toHaveAttribute('href', '/offers', { timeout: 2_000 })
  })
})

test('café info and opening hours: saved and shown on the contact page', async ({ page }) => {
  await page.goto('/admin/cafe')
  await field(page, 'Phone').fill('+91 98765 43210')
  await page.getByRole('checkbox', { name: /Phone \/ email \/ WhatsApp confirmed/ }).check()
  await field(page, 'Instagram link').fill('https://evil.example/instagram')
  await page.getByRole('button', { name: 'Save café information' }).click()
  await expect(page.getByText('Instagram: an https://instagram.com/… link.')).toBeVisible()
  await field(page, 'Instagram link').fill('')
  await page.getByRole('button', { name: 'Save café information' }).click()
  await expect(page.getByText('Café information saved.')).toBeVisible()

  await page.getByLabel('Monday opens').fill('09:15')
  await page.getByLabel('Monday closes').fill('21:45')
  await page.getByRole('button', { name: 'Save opening hours' }).click()
  await expect(page.getByText('Opening hours saved.')).toBeVisible()

  await expectPublic(page, '/contact', async (p) => {
    await expect(p.getByRole('main').getByText('+91 98765 43210').first()).toBeVisible({
      timeout: 2_000,
    })
    await expect(p.getByRole('main').getByText('9:15 AM – 9:45 PM')).toBeVisible({ timeout: 2_000 })
  })
})

test('gallery: hide, reorder and edit photos; public gallery follows', async ({ page }) => {
  await page.goto('/admin/gallery')
  const items = page.getByTestId('gallery-admin-item')
  await expect(items).toHaveCount(2)
  await page.getByRole('button', { name: 'Move photo 2 earlier' }).click()
  await expect(page.getByText('Gallery order saved.')).toBeVisible()
  await expect(items.first().getByRole('textbox', { name: 'Alt text' })).toHaveValue(
    'E2E photo two',
  )

  const second = items.nth(1)
  await second.getByRole('textbox', { name: 'Caption' }).fill('E2E caption')
  await second.getByRole('checkbox', { name: 'Published' }).uncheck()
  await second.getByRole('button', { name: 'Save photo' }).click()
  await expect(page.getByText('Photo saved.')).toBeVisible()

  await expectPublic(page, '/gallery', async (p) => {
    const buttons = p.getByRole('button', { name: /^Open photo:/ })
    await expect(buttons).toHaveCount(1, { timeout: 2_000 })
    await expect(buttons.first()).toHaveAccessibleName('Open photo: E2E photo two', {
      timeout: 2_000,
    })
  })
})

test('uploads: banner and gallery photo go to Storage; disguised file refused', async ({
  page,
}) => {
  test.skip(
    !process.env.SUPABASE_SECRET_KEY,
    'NOT RUN: SUPABASE_SECRET_KEY and the public-media bucket are needed (DEPLOYMENT.md §7)',
  )
  await page.goto('/admin/gallery')
  await page.getByLabel('Photo').setInputFiles({
    name: 'evil.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('<html><script>alert(1)</script></html>'),
  })
  await field(page, 'Alt text').first().fill('E2E disguised file')
  await page.getByRole('button', { name: 'Upload photo' }).click()
  await expect(page.getByText('Only JPEG, PNG or WebP images are allowed.')).toBeVisible()

  const png = await sharp({
    create: { width: 800, height: 600, channels: 3, background: '#006947' },
  })
    .png()
    .toBuffer()
  await page
    .getByLabel('Photo')
    .setInputFiles({ name: 'ok.png', mimeType: 'image/png', buffer: png })
  await field(page, 'Alt text').first().fill('E2E uploaded photo')
  await page.getByRole('button', { name: 'Upload photo' }).click()
  await expect(page.getByText('Photo added and published.')).toBeVisible()
  await expectPublic(page, '/gallery', async (p) => {
    await expect(p.getByRole('button', { name: 'Open photo: E2E uploaded photo' })).toBeVisible({
      timeout: 2_000,
    })
  })
})

test('5C pages are accessible (axe) and have no horizontal scroll', async ({ page }) => {
  for (const path of [
    '/admin/offers',
    '/admin/offers/new',
    '/admin/banners',
    '/admin/banners/e2ebanner000000000000001',
    '/admin/cafe',
    '/admin/gallery',
  ]) {
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
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0)
    }
    await page.setViewportSize({ width: 1280, height: 720 })
  }
})

test('offer management visual baselines (TC-VIS)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'baselines are recorded in Chromium')
  test.skip(process.platform !== 'darwin', 'visual baselines are recorded on macOS')
  for (const [device, width, height] of [
    ['desktop', 1440, 900],
    ['mobile', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/admin/offers')
    await expect(page.getByTestId('admin-offer-row').first()).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot(`admin-offers-${device}.png`, {
      fullPage: false,
      // Offer dates and statuses depend on today's date (seeded relative to the seed run).
      mask: [page.getByText(/Signed in as/), page.locator('[data-volatile]')],
      maxDiffPixelRatio: 0.01,
    })
  }
})
