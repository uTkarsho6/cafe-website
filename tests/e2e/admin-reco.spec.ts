import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ADMIN, allowlistTestAdmin, asClient, hasAccounts, signIn, testDb } from './admin-helpers'

/**
 * Phase R5a — admin recommendations: TC-E2E-097/098, TC-A11Y-007, TC-RESP-005, TC-VIS-105/106.
 * Changes shared test data (switch, versions, tags), so it runs after the other admin suites.
 * The test database starts with one trained, switched-on run (`npm run test:db:reco`).
 */
test.skip(!hasAccounts, 'NOT RUN: set E2E_ADMIN_* and E2E_USER_* in .env.local')
test.describe.configure({ mode: 'serial' })
test.setTimeout(120_000)
test.use({ trace: 'off' }) // traces would record the typed test password

const PAGE = '/admin/recommendations'
// Highest version number (training keeps only the 10 newest runs, so a count can stay flat).
const latestVersion = () =>
  testDb(async (db) =>
    Number((await db.query('SELECT coalesce(max(version), 0) AS v FROM "RecoModelRun"')).rows[0].v),
  )

test.beforeAll(async () => {
  await allowlistTestAdmin()
})

test.afterAll(async () => {
  // Leave the switch on and the weights at their defaults for other runs.
  await testDb((db) =>
    db.query(
      `UPDATE "RecoSettings" SET enabled = true, "compCoocPm" = 500, "compQualityPm" = 0, "compContentPm" = 500,
       "simContentPm" = 500, "simTastePm" = 200, "simQualityPm" = 300`,
    ),
  )
})

test.beforeEach(async ({ page }) => {
  await asClient(page)
  await signIn(page, ADMIN.email!, ADMIN.password!, `/admin/login?next=${PAGE}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Recommendations' })).toBeVisible()
})

/** Polls a public page with fresh requests until `check` passes (≤ 30 s rule; budget 15 s). */
async function expectPublic(page: Page, path: string, check: (p: Page) => Promise<void>) {
  const pub = await page.context().newPage()
  await expect(async () => {
    await pub.goto(path)
    await check(pub)
  }).toPass({ timeout: 15_000, intervals: [500, 1_000, 2_000] })
  await pub.close()
}
const rows = (p: Page, name: string) =>
  p.getByRole('region', { name }).locator('li > a[href^="/menu/"]')

test('switch off → café picks only; switch on → full lists again (TC-E2E-097)', async ({
  page,
}) => {
  const sw = page.getByRole('switch', { name: 'Show recommendations on the website' })
  await expect(sw).toHaveAttribute('aria-checked', 'true')
  await sw.click()
  await expect(page.getByText('Recommendations switched off')).toBeVisible()
  await expectPublic(page, '/menu/classic-veg-burger', async (p) => {
    await expect(rows(p, 'Goes well with')).toHaveCount(2, { timeout: 2_000 }) // the 2 café picks
    await expect(rows(p, 'You may also like')).toHaveCount(1, { timeout: 2_000 })
  })
  await page.reload()
  await sw.click()
  await expect(page.getByText('Recommendations are now shown on the website.')).toBeVisible()
  await expectPublic(page, '/menu/classic-veg-burger', async (p) => {
    await expect(rows(p, 'Goes well with')).toHaveCount(4, { timeout: 2_000 })
  })
  const audited = await testDb(async (db) =>
    Number(
      (
        await db.query(
          `SELECT count(*) FROM "AuditLog" WHERE "entityType" = 'recommendations' AND summary LIKE 'Recommendations switched%'`,
        )
      ).rows[0].count,
    ),
  )
  expect(audited).toBeGreaterThanOrEqual(2)
})

test('retrain lists a new version; an earlier version can be activated again (TC-E2E-097)', async ({
  page,
}) => {
  const before = await latestVersion()
  await page.getByRole('button', { name: 'Retrain now' }).click()
  await expect(page.getByText(/Version \d+ (trained and activated|was not activated)/)).toBeVisible(
    {
      timeout: 60_000,
    },
  )
  expect(await latestVersion()).toBeGreaterThan(before)

  await page.goto(`${PAGE}?tab=runs`)
  const table = page.getByRole('region', { name: 'Versions table' })
  await expect(table.getByText('active', { exact: true })).toHaveCount(1)
  const activate = table.getByRole('button', { name: /^Activate version \d+$/ }).first()
  const version = Number((await activate.locator('.sr-only').innerText()).replace(/\D/g, ''))
  await activate.click()
  const dialog = page.getByRole('dialog', { name: `Activate version ${version}?` })
  await dialog.getByRole('button', { name: `Activate version ${version}` }).click()
  await expect(page.getByText(`Version ${version} is now active.`)).toBeVisible()
  const active = await testDb(
    async (db) =>
      (
        await db.query(
          `SELECT r.version FROM "RecoSettings" s JOIN "RecoModelRun" r ON r.id = s."activeRunId"`,
        )
      ).rows[0].version,
  )
  expect(active).toBe(version)
})

test('weights: invalid values show field errors; valid ones persist', async ({ page }) => {
  const taste = page.getByRole('spinbutton', { name: /Taste/ })
  await taste.fill('1500')
  await page.getByRole('button', { name: 'Save weights' }).click()
  await expect(page.getByText('Taste: enter a whole number from 0 to 1000.')).toBeVisible()
  await taste.fill('250')
  await page.getByRole('button', { name: 'Save weights' }).click()
  await expect(page.getByText(/Weights saved/)).toBeVisible()
  await page.reload()
  await expect(page.getByRole('spinbutton', { name: /Taste/ })).toHaveValue('250')
  // Put the default back so later tests (and the visual baseline) see the tuned weights.
  await testDb((db) => db.query('UPDATE "RecoSettings" SET "simTastePm" = 200'))
})

test('inspect shows the stored list with score components and what is hidden now', async ({
  page,
}) => {
  await page.goto(`${PAGE}?tab=inspect`)
  await page.getByRole('combobox', { name: 'Dish' }).selectOption({ label: 'Classic Veg Burger' })
  await page.getByRole('button', { name: 'Show lists' }).click()
  const gww = page.getByRole('region', { name: 'Goes well with table' })
  await expect(gww.getByRole('row')).not.toHaveCount(1)
  await expect(gww.getByRole('columnheader', { name: 'Co-occ.' })).toBeVisible()
  // The seed's sold-out dishes are labelled when they appear in a stored list.
  const text = await page.getByRole('main').innerText()
  if (text.includes('Double Cheese Burger')) expect(text).toContain('Sold out')
})

test('flavour-tag and meal-role edits persist and trigger a retrain (TC-E2E-098)', async ({
  page,
}) => {
  const target = await testDb(async (db) => {
    const { rows } = await db.query<{ id: string; flavorTags: string }>(
      `SELECT id, "flavorTags"::text AS "flavorTags" FROM "MenuItem" WHERE slug = 'red-sauce-pasta'`,
    )
    return rows[0]!
  })
  const before = await latestVersion()
  await page.goto(`/admin/menu/${target.id}`)
  const details = page.getByRole('region', { name: 'Details' })
  const spicy = details.getByRole('checkbox', { name: 'Spicy' })
  const wasChecked = await spicy.isChecked()
  await details.getByText('Spicy', { exact: true }).click()
  await details.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Item saved.')).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('region', { name: 'Details' }).getByRole('checkbox', { name: 'Spicy' }),
  ).toBeChecked({
    checked: !wasChecked,
  })
  // The retrain runs after the response (after()); poll the database for the new version.
  await expect.poll(latestVersion, { timeout: 30_000 }).toBeGreaterThan(before)

  // Meal role on a category persists. (The edit dialog closes on save before its toast shows —
  // pre-existing behaviour of the category editor — so the database is checked instead.)
  const dessertRole = () =>
    testDb(async (db) =>
      String(
        (await db.query(`SELECT "mealRole" FROM "MenuCategory" WHERE slug = 'desserts'`)).rows[0]
          .mealRole,
      ),
    )
  for (const value of ['SIDE', 'DESSERT']) {
    await page.goto('/admin/categories')
    await page.getByRole('button', { name: 'Edit Desserts' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit Desserts' })
    await dialog.getByRole('combobox', { name: 'Meal role' }).selectOption(value)
    await dialog.getByRole('button', { name: 'Save category' }).click()
    await expect(dialog).toBeHidden()
    await expect.poll(dessertRole).toBe(value)
  }

  // Restore the tag.
  await page.goto(`/admin/menu/${target.id}`)
  await page.getByRole('region', { name: 'Details' }).getByText('Spicy', { exact: true }).click()
  await page
    .getByRole('region', { name: 'Details' })
    .getByRole('button', { name: 'Save changes' })
    .click()
  await expect(page.getByText('Item saved.')).toBeVisible()
})

test('accessibility and layout of every tab (TC-A11Y-007, TC-RESP-005)', async ({ page }) => {
  for (const tab of ['overview', 'runs', 'inspect']) {
    await page.goto(`${PAGE}?tab=${tab}`)
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(
      results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${tab} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([])
  }
  for (const width of [375, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const tab of ['overview', 'runs']) {
      await page.goto(`${PAGE}?tab=${tab}`)
      await page.waitForLoadState('networkidle')
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${tab} at ${width}`,
      ).toBeLessThanOrEqual(width)
    }
  }
})

test('visual baselines (TC-VIS-105/106)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'baselines are recorded in Chromium')
  test.skip(process.platform !== 'darwin', 'visual baselines are recorded on macOS')
  for (const [device, width, height] of [
    ['desktop', 1440, 900],
    ['mobile', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(PAGE)
    await expect(page.getByRole('switch')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    // Version numbers, dates and metrics change with every run, so the summary cards are masked.
    await expect(page).toHaveScreenshot(`admin-reco-${device}.png`, {
      mask: [page.getByRole('region', { name: 'Summary' })],
      maxDiffPixelRatio: 0.01,
    })
  }
})
