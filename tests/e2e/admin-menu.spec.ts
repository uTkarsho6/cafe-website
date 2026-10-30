import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import { ADMIN, allowlistTestAdmin, asClient, hasAccounts, signIn, testDb } from './admin-helpers'

/**
 * Menu administration E2E (Phase 5B, TC-E2E-070…075). Signs in as the E2E admin (see
 * admin-helpers.ts) and checks that changes persist and reach the public site within 30 s.
 */
test.skip(!hasAccounts, 'NOT RUN: set E2E_ADMIN_* and E2E_USER_* in .env.local')
test.describe.configure({ mode: 'serial' })
// Sign-in plus up to 30 s waiting for the public site per check.
test.setTimeout(120_000)
// Traces record typed values, including the test password: never keep them for admin specs.
test.use({ trace: 'off' })

type Seeded = { id: string; slug: string; name: string; pricePaise: number }
let target: Seeded

test.beforeAll(async () => {
  await allowlistTestAdmin()
  target = await testDb(async (db) => {
    const { rows } = await db.query<Seeded>(
      `SELECT i.id, i.slug, i.name, i."pricePaise" FROM "MenuItem" i
       JOIN "MenuCategory" c ON c.id = i."categoryId"
       WHERE i."isPublished" AND NOT i."isArchived" AND i."isAvailable" AND NOT c."isArchived"
       ORDER BY i.slug LIMIT 1`,
    )
    return rows[0]!
  })
})

test.afterAll(async () => {
  // Leave the shared test database as the other suites expect it.
  await testDb((db) =>
    db.query(`UPDATE "MenuItem" SET "pricePaise" = $2, "isAvailable" = true WHERE id = $1`, [
      target.id,
      target.pricePaise,
    ]),
  )
  await testDb((db) => db.query(`DELETE FROM "MenuItem" WHERE name LIKE 'E2E %'`))
  await testDb((db) => db.query(`DELETE FROM "MenuCategory" WHERE name LIKE 'E2E %'`))
})

test.beforeEach(async ({ page }) => {
  await asClient(page)
  await signIn(page, ADMIN.email!, ADMIN.password!, '/admin/login?next=/admin/menu')
  await expect(page.getByRole('heading', { level: 1, name: 'Menu items' })).toBeVisible()
})

const details = (page: Page) => page.getByRole('region', { name: 'Details' })

/**
 * Polls the public page (a fresh request each time) until it shows the change. The requirement
 * is ≤30 s; on-demand expiry (updateTag) should make it near-immediate, so the budget is 15 s (each check waits up to 2 s for streamed content):
 * a page that only refreshes when its 30 s cache window runs out fails this check.
 */
async function expectPublic(page: Page, path: string, check: (p: Page) => Promise<void>) {
  const pub = await page.context().newPage()
  await expect(async () => {
    await pub.goto(path)
    await check(pub)
  }).toPass({ timeout: 15_000, intervals: [500, 1_000, 2_000] })
  await pub.close()
}

test('price and availability edits persist and reach the public item page within 30 s', async ({
  page,
}) => {
  await page.getByRole('searchbox', { name: 'Search by name' }).fill(target.name)
  await page.getByRole('button', { name: 'Apply' }).click()
  const row = page.getByTestId('admin-item-row').filter({ hasText: target.name })
  await expect(row).toHaveCount(1)
  // Warm the public cache first, so the check below proves on-demand expiry.
  const warm = await page.context().newPage()
  await warm.goto(`/menu/${target.slug}`)
  await expect(warm.getByRole('main').getByText('Available').first()).toBeVisible()
  // Let the warm render finish writing its cache entry. A render still in flight when the admin
  // saves can keep the old copy until its 30 s window ends (ADR-050); this test checks the
  // on-demand path, which is near-instant.
  await warm.waitForTimeout(2_000)
  await warm.close()

  // TC-E2E-094: find a dish whose recommendations currently list the target.
  const slugs = await testDb(async (db) => {
    const { rows } = await db.query<{ slug: string }>(
      `SELECT slug FROM "MenuItem" WHERE "isPublished" AND NOT "isArchived" AND id <> $1 ORDER BY slug`,
      [target.id],
    )
    return rows.map((r) => r.slug)
  })
  let source: string | undefined
  for (const slug of slugs) {
    const res = await page.request.get(`/api/v1/menu/${slug}/recommendations`, {
      headers: { 'x-forwarded-for': '198.51.100.94' },
    })
    if (!res.ok()) continue
    const { data } = await res.json()
    const listed = [...data.goesWellWith, ...data.youMayAlsoLike].map(
      (c: { slug: string }) => c.slug,
    )
    if (listed.includes(target.slug)) {
      source = slug
      break
    }
  }
  expect(source, 'some dish recommends the target before it is sold out').toBeDefined()

  // Quick toggle in the list.
  await row.getByRole('switch', { name: `Available: ${target.name}` }).click()
  await expect(page.getByText(`"${target.name}" is now out of stock.`)).toBeVisible()
  await expectPublic(page, `/menu/${target.slug}`, async (p) => {
    await expect(p.getByRole('main').getByText('Out of stock').first()).toBeVisible({
      timeout: 2_000,
    })
  })
  // ... and it leaves the recommendations within the same window (list refills, no retraining).
  await expectPublic(page, `/menu/${source}`, async (p) => {
    const sections = p.getByTestId('reco-section')
    await expect(sections.first()).toBeVisible({ timeout: 2_000 })
    await expect(sections.getByText(target.name, { exact: true })).toHaveCount(0)
  })

  // Full edit form: new price, available again.
  await row.getByRole('link', { name: `Edit ${target.name}` }).click()
  await details(page).getByRole('textbox', { name: 'Price (₹)' }).fill('123.50')
  await details(page)
    .getByRole('checkbox', { name: /^Available/ })
    .check()
  await details(page).getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Item saved.')).toBeVisible()
  await page.reload() // persisted, not just client state
  await expect(details(page).getByRole('textbox', { name: 'Price (₹)' })).toHaveValue('123.50')
  await expectPublic(page, `/menu/${target.slug}`, async (p) => {
    await expect(p.getByRole('main').getByText('₹123.50').first()).toBeVisible({ timeout: 2_000 })
    await expect(p.getByRole('main').getByText('Available').first()).toBeVisible({ timeout: 2_000 })
  })
})

test('validation errors are shown next to fields and keep the typed values', async ({ page }) => {
  await page.getByRole('link', { name: 'New item' }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('E2E Invalid')
  await page.getByRole('textbox', { name: 'Price (₹)' }).fill('-5')
  await page.getByRole('button', { name: 'Create item' }).click()
  await expect(page.getByText('Price: enter rupees, e.g. 149 or 149.50.')).toBeVisible()
  await expect(page.getByText('Choose a category.')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('E2E Invalid')
})

test('create → public menu, archive → hidden, delete → gone (with audit entries)', async ({
  page,
}) => {
  const name = `E2E Masala Toast ${Date.now()}`
  // Warm the public search page while the item does not exist yet: the create action must expire
  // it (regression: actions that ended with redirect() left public pages stale, ADR-050).
  const search = `/menu?q=${encodeURIComponent(name)}`
  const warm = await page.context().newPage()
  await warm.goto(search)
  await expect(warm.getByTestId('menu-card')).toHaveCount(0)
  // Let the warm render finish writing its cache entry. A render still in flight when the admin
  // saves can keep the old copy until its 30 s window ends (ADR-050); this test checks the
  // on-demand path, which is near-instant.
  await warm.waitForTimeout(2_000)
  await warm.close()
  await page.getByRole('link', { name: 'New item' }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
  await page.getByRole('textbox', { name: 'Price (₹)' }).fill('89')
  await page.getByRole('combobox', { name: 'Category' }).selectOption({ index: 1 })
  await page
    .getByRole('textbox', { name: 'Description' })
    .fill('Crisp toast with a spicy masala filling.')
  await page.getByRole('checkbox', { name: /^Published/ }).check()
  await page.getByRole('button', { name: 'Create item' }).click()
  await expect(page).toHaveURL(/\/admin\/menu\/[a-z0-9]+\?created=1$/)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()

  await expectPublic(page, search, async (p) => {
    await expect(p.getByTestId('menu-card').filter({ hasText: name })).toHaveCount(1, {
      timeout: 2_000,
    })
  })

  await page.getByRole('button', { name: 'Archive item' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click()
  await expect(page.getByText('Item archived: hidden from the public site.')).toBeVisible()
  await expectPublic(page, search, async (p) => {
    await expect(p.getByTestId('menu-card').filter({ hasText: name })).toHaveCount(0, {
      timeout: 2_000,
    })
  })

  await page.getByRole('button', { name: 'Delete permanently' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently' }).click()
  await expect(page).toHaveURL(/\/admin\/menu\?deleted=1$/, { timeout: 15_000 })
  await expect(page.getByText('Item deleted.')).toBeVisible()

  const actions = await testDb(async (db) => {
    const { rows } = await db.query<{ action: string }>(
      `SELECT action FROM "AuditLog" WHERE summary LIKE $1 ORDER BY "createdAt"`,
      [`%${name}%`],
    )
    return rows.map((r) => r.action)
  })
  expect(actions).toEqual(['CREATE', 'ARCHIVE', 'DELETE'])
})

test('add-ons and linked items save and show on the public page', async ({ page }) => {
  await page.goto(`/admin/menu/${target.id}`)
  const addons = page.getByRole('region', { name: 'Add-ons' })
  await addons.getByRole('button', { name: 'Add group' }).click()
  const group = addons.getByRole('group', { name: /Group \d+/ }).last()
  await group.getByRole('textbox', { name: 'Group name' }).fill('E2E Extras')
  await group.getByRole('textbox', { name: 'Option 1', exact: true }).fill('E2E Cheese')
  await group.getByRole('textbox', { name: 'Extra price (₹)' }).fill('25')
  await addons.getByRole('button', { name: 'Save add-ons' }).click()
  await expect(page.getByText('Add-ons saved.')).toBeVisible()
  await expectPublic(page, `/menu/${target.slug}`, async (p) => {
    await expect(p.getByRole('main').getByText('E2E Cheese')).toBeVisible({ timeout: 2_000 })
  })
  // Linked items: tick the first "related" item and check the public page lists it.
  const links = page.getByRole('region', { name: 'Linked items' })
  const first = links
    .getByRole('group', { name: /Related items/ })
    .getByRole('checkbox')
    .first()
  const linkedName = (await first.locator('xpath=ancestor::label').innerText()).trim()
  await first.check()
  await links.getByRole('button', { name: 'Save linked items' }).click()
  await expect(page.getByText('Linked items saved.')).toBeVisible()
  await expectPublic(page, `/menu/${target.slug}`, async (p) => {
    // R4: admin "related" links are café picks at the top of "You may also like".
    const related = p.getByRole('region', { name: 'You may also like' })
    await expect(related.getByRole('link', { name: new RegExp(linkedName) })).toBeVisible({
      timeout: 2_000,
    })
  })
  await first.uncheck()
  await links.getByRole('button', { name: 'Save linked items' }).click()
  await expect(page.getByText('Linked items saved.')).toBeVisible()

  // Clean up: remove the group again.
  await page.reload()
  await addons
    .getByRole('group', { name: /Group \d+/ })
    .last()
    .getByRole('button', { name: 'Remove group' })
    .click()
  await addons.getByRole('button', { name: 'Save add-ons' }).click()
  await expect(page.getByText('Add-ons saved.')).toBeVisible()
})

test('categories: create, archive, delete', async ({ page }) => {
  const name = `E2E Cat ${Date.now() % 100000}`
  await page.goto('/admin/categories')
  const form = page.getByRole('region', { name: 'New category' })
  await form.getByLabel('Name').fill(name)
  await form.getByRole('button', { name: 'Add category' }).click()
  await expect(page.getByText('Category created.')).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: name })
  await row.getByRole('button', { name: `Archive ${name}` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click()
  await expect(row.getByText('Archived')).toBeVisible()
  await row.getByRole('button', { name: `Delete ${name}` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently' }).click()
  await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0)
})

test('image upload: real file reaches Storage and the public page; disguised file refused', async ({
  page,
}) => {
  test.skip(
    !process.env.SUPABASE_SECRET_KEY,
    'NOT RUN: SUPABASE_SECRET_KEY and the public-media bucket are needed (DEPLOYMENT.md §7)',
  )
  await page.goto(`/admin/menu/${target.id}`)
  const images = page.getByRole('region', { name: 'Images' })
  await images.getByLabel('Image file').setInputFiles({
    name: 'evil.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<?php system($_GET[1]); ?>'),
  })
  await images.getByRole('button', { name: 'Upload image' }).click()
  await expect(images.getByRole('alert')).toHaveText('Only JPEG, PNG or WebP images are allowed.')

  const png = await sharp({
    create: { width: 640, height: 480, channels: 3, background: '#fcb812' },
  })
    .png()
    .toBuffer()
  await images
    .getByLabel('Image file')
    .setInputFiles({ name: 'ok.png', mimeType: 'image/png', buffer: png })
  await images.getByLabel('Alt text').last().fill('E2E test photo')
  await images.getByRole('button', { name: 'Upload image' }).click()
  await expect(page.getByText('Image uploaded.')).toBeVisible()
  // The seeded demo photo stays first, so the upload is the last thumbnail (thumbnails have alt="";
  // their button carries the label). Select it like a customer would, then check the main image.
  await expectPublic(page, `/menu/${target.slug}`, async (p) => {
    const thumbs = p.getByRole('list', { name: 'More images' }).getByRole('button')
    await thumbs.last().click()
    await expect(p.getByRole('img', { name: 'E2E test photo' }).first()).toBeVisible({
      timeout: 2_000,
    })
  })
  // Clean up (also removes the file from Storage).
  await page.reload()
  await images.getByRole('button', { name: 'Remove' }).last().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove image' }).click()
  await expect(page.getByText('Image removed.')).toBeVisible()
})

test('menu management pages are accessible (axe) and have no horizontal scroll', async ({
  page,
}) => {
  for (const path of ['/admin/menu', `/admin/menu/${target.id}`, '/admin/categories']) {
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
  }
})

test('menu management visual baselines (TC-VIS)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'baselines are recorded in Chromium')
  test.skip(process.platform !== 'darwin', 'visual baselines are recorded on macOS')
  for (const [device, width, height] of [
    ['desktop', 1440, 900],
    ['mobile', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/admin/menu')
    await expect(page.getByTestId('admin-item-row').first()).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot(`admin-menu-${device}.png`, {
      fullPage: false,
      mask: [page.getByText(/Signed in as/)],
      maxDiffPixelRatio: 0.01,
    })
  }
})
