import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Phase R4 — recommendations on the public site: TC-E2E-093, 095, 096, TC-A11Y-007, TC-RESP-005,
 * TC-VIS-101…104. The test database has a trained, switched-on run (`npm run test:db:reco`).
 * Sold out in the seed: double-cheese-burger, chocolate-shake; unpublished: pink-sauce-pasta.
 * TC-E2E-094 (admin marks a dish sold out) is in admin-menu.spec.ts, which may change data.
 */

const WIDTHS = [375, 430, 768, 1024, 1440]
const HIDDEN = ['Double Cheese Burger', 'Chocolate Shake', 'Pink Sauce Pasta']
const SLUGS = [
  'classic-veg-burger',
  'paneer-tikka-burger',
  'margherita-pizza',
  'farmhouse-pizza',
  'tandoori-paneer-pizza',
  'white-sauce-pasta',
  'red-sauce-pasta',
  'french-fries',
  'peri-peri-fries',
  'cheese-garlic-bread',
  'cold-coffee',
  'masala-lemonade',
  'chocolate-brownie',
  'brownie-with-ice-cream',
]

async function gotoReady(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
}

async function axeSeriousOrCritical(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

const rupees = (s: string) => Number(s.replace(/[₹,]/g, ''))
const section = (page: Page, name: string) => page.getByRole('region', { name })
/** The dish rows of a section (the caption link is not a row). */
const rows = (page: Page, name: string) => section(page, name).locator('li > a[href^="/menu/"]')

test.describe('item page recommendations (TC-E2E-093)', () => {
  test('both sections with 4 rows, reason chips, caption; café picks first; links open the item', async ({
    page,
  }) => {
    await gotoReady(page, '/menu/classic-veg-burger')
    const gww = rows(page, 'Goes well with')
    const ymal = rows(page, 'You may also like')
    await expect(gww).toHaveCount(4)
    await expect(ymal).toHaveCount(4)
    // Café-curated links (seed: fries + cold coffee; paneer tikka burger) come first.
    await expect(gww.nth(0)).toContainText('French Fries')
    await expect(gww.nth(0)).toContainText('Café pick')
    await expect(gww.nth(1)).toContainText('Cold Coffee')
    await expect(ymal.nth(0)).toContainText('Paneer Tikka Burger')
    // At least one model suggestion with a reason chip from the fixed list.
    await expect(
      section(page, 'Goes well with')
        .getByText(/A (drink|side|main) to go with it|Something sweet after/)
        .first(),
    ).toBeVisible()
    await expect(
      page.getByText('Suggestions are generated automatically from our menu.'),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Help me choose' })).toHaveAttribute(
      'href',
      '/help-me-choose',
    )
    // The old headings are gone (FR-063/064 replace them).
    await expect(page.getByRole('heading', { name: 'Frequently bought together' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Related items' })).toHaveCount(0)

    const target = gww.nth(2)
    const name = (await target.locator('span.truncate').first().innerText()).trim()
    await target.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
  })

  test('every dish: no self, no sold-out or unpublished dish, goes-well-with never the same course', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    for (const slug of SLUGS) {
      await page.goto(`/menu/${slug}`)
      const h1 = (await page.getByRole('heading', { level: 1 }).innerText()).trim()
      const rows = page.getByTestId('reco-section').getByRole('link')
      await expect(rows.first()).toBeVisible()
      const text = (await rows.allInnerTexts()).join('\n')
      expect(text, slug).not.toContain('Out of stock')
      for (const hidden of [...HIDDEN, h1])
        expect(text, `${slug} lists ${hidden}`).not.toContain(hidden)
    }
  })

  test('flavour chips under the description', async ({ page }) => {
    await gotoReady(page, '/menu/margherita-pizza')
    const chips = page.getByRole('list', { name: 'Flavours' })
    await expect(chips).toBeVisible()
    await expect(chips.getByRole('listitem')).toContainText(['Cheesy'])
  })
})

test.describe('Help me choose (TC-E2E-095)', () => {
  test('menu entry point opens the page; answers go into a shareable URL', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoReady(page, '/menu')
    await page.getByRole('region', { name: 'Not sure what to pick?' }).getByRole('link').click()
    await expect(page).toHaveURL(/\/help-me-choose$/)
    await expect(page.getByText('Pick what you are in the mood for')).toBeVisible()

    const form = page.getByRole('form', { name: 'Help me choose' })
    await form.getByText('A meal', { exact: true }).click()
    await form.getByText('₹100–₹200', { exact: true }).click()
    await form.getByText('Cheesy', { exact: true }).click()
    await page.getByRole('button', { name: 'Show suggestions' }).click()
    await expect(page).toHaveURL(/mood=meal&budget=100-200&tags=CHEESY/)
    await expect(page.getByRole('heading', { name: /suggestions? for you/ })).toBeVisible()

    // Shareable: a fresh page with the same URL shows the same answers ticked.
    const shared = await page.context().newPage()
    await shared.goto(page.url())
    await expect(shared.getByRole('radio', { name: 'A meal' })).toBeChecked()
    await expect(shared.getByRole('checkbox', { name: 'Cheesy' })).toBeChecked()
    await shared.close()
  })

  // In the test menu no main + side/drink fits ₹100–₹200 (cheapest: ₹149 + ₹59), so that band
  // must show no pairing; "Any" must show pairings. Both check the totals are real sums.
  for (const [budget, min, max, expectPairs] of [
    ['100-200', 100, 200, false],
    ['any', 0, Infinity, true],
  ] as const)
    test(`meal, budget ${budget}: ≤ 5 dishes in budget, pairing totals real and in budget`, async ({
      page,
    }) => {
      await gotoReady(page, `/help-me-choose?mood=meal&budget=${budget}`)
      const items = page.getByRole('main').getByTestId('suggestion')
      const n = await items.count()
      expect(n).toBeGreaterThan(0)
      expect(n).toBeLessThanOrEqual(5)
      let pairs = 0
      for (let i = 0; i < n; i++) {
        const li = items.nth(i)
        const price = Number(await li.getAttribute('data-price')) / 100
        expect(price).toBeGreaterThanOrEqual(min)
        expect(price).toBeLessThanOrEqual(max)
        if (await li.getByTestId('pairing').count()) {
          pairs++
          const pairPrice = rupees(await li.getByTestId('pair-price').innerText())
          const total = rupees(await li.getByTestId('pair-total').innerText())
          expect(total).toBe(price + pairPrice) // real arithmetic, not an offer
          expect(total).toBeLessThanOrEqual(max)
        }
      }
      expect(pairs > 0).toBe(expectPairs)
      const text = await page.getByRole('main').innerText()
      for (const hidden of HIDDEN) expect(text).not.toContain(hidden)
    })

  test('flavour matches come first; a 4th flavour in the URL is refused', async ({ page }) => {
    await gotoReady(page, '/help-me-choose?mood=meal&tags=CHEESY')
    const first = page.getByRole('main').getByTestId('suggestion').first()
    await expect(first.getByRole('list', { name: 'Why we suggest it' })).toContainText('Cheesy')

    await gotoReady(page, '/help-me-choose?mood=meal&tags=SPICY,CHEESY,KOREAN,MINTY')
    await expect(page.locator('#tags-hint')).toHaveText('Choose up to 3 flavours.')
    await expect(page.getByRole('heading', { name: /for you/ })).toHaveCount(0)
  })

  test('nothing matches → empty state with "Remove flavours" keeping mood and budget', async ({
    page,
  }) => {
    await gotoReady(page, '/help-me-choose?mood=drink&budget=200-plus&tags=SPICY')
    await expect(
      page.getByRole('heading', { name: 'Nothing matches all three answers' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Remove flavours' })).toHaveAttribute(
      'href',
      '/help-me-choose?mood=drink&budget=200-plus',
    )
    await page.getByRole('link', { name: 'Start over' }).last().click()
    await expect(page).toHaveURL(/\/help-me-choose$/)
    await expect(page.getByRole('radio', { name: 'A drink' })).not.toBeChecked()
  })
})

/**
 * Server rendering (TC-E2E-095). The answers are a plain GET form and the results are rendered on
 * the server from the URL. NOTE: with JavaScript fully disabled the streamed part of the page stays
 * hidden: React reveals streamed Suspense content with inline scripts. This affects every dynamic
 * page since Phase 4A (cache components), not only this one; see the R4 report §8 and the backlog.
 */
test.describe('plain GET form, results rendered on the server (TC-E2E-095)', () => {
  test('the form is a GET form to /help-me-choose with native controls', async ({ page }) => {
    await gotoReady(page, '/help-me-choose')
    const form = page.getByRole('form', { name: 'Help me choose' })
    expect(
      await form.evaluate((f: HTMLFormElement) => [f.method, new URL(f.action).pathname]),
    ).toEqual(['get', '/help-me-choose'])
    await expect(form.locator('input[type=radio][name=mood]')).toHaveCount(4)
    await expect(form.locator('input[type=radio][name=budget]')).toHaveCount(4)
    await expect(form.locator('input[type=checkbox][name=tags]')).toHaveCount(13)
  })

  test('the HTML response for a shared URL already contains the suggestions', async ({
    request,
  }) => {
    const html = await (await request.get('/help-me-choose?mood=drink&tags=COFFEE')).text()
    expect(html).toContain('Cold Coffee')
    expect(html).toMatch(/suggestions? for you/)
    expect(html).not.toContain('Chocolate Shake') // sold out
  })
})

test.describe('honesty (TC-E2E-096)', () => {
  test('no ratings, counts, "people who…", "frequently bought" or demo comments on public pages', async ({
    page,
  }) => {
    for (const path of [
      '/menu/classic-veg-burger',
      '/menu/cold-coffee',
      '/help-me-choose?mood=meal',
      '/help-me-choose?mood=sweet&tags=CHOCOLATE',
      '/menu',
    ]) {
      await gotoReady(page, path)
      const text = await page.getByRole('main').innerText()
      expect(text, path).not.toMatch(
        /★|⭐|\b\d(\.\d)?\s*\/\s*5\b|rating|reviews?\b|% of|people who|customers who|frequently bought|ordered together|not impressed|loved the/i,
      )
    }
  })
})

test.describe('accessibility (TC-A11Y-007)', () => {
  for (const path of [
    '/help-me-choose',
    '/help-me-choose?mood=meal&budget=100-200&tags=CHEESY',
    '/help-me-choose?mood=drink&budget=200-plus&tags=SPICY',
    '/menu/classic-veg-burger',
  ])
    test(`axe: ${path}`, async ({ page }) => {
      await gotoReady(page, path)
      expect(await axeSeriousOrCritical(page)).toEqual([])
    })

  test('keyboard: Tab reaches the chips with a visible focus ring; Space ticks a flavour', async ({
    page,
  }) => {
    await gotoReady(page, '/help-me-choose')
    const meal = page.getByRole('radio', { name: 'A meal' })
    await meal.focus()
    await page.keyboard.press('Space')
    await expect(meal).toBeChecked()
    const spicy = page.getByRole('checkbox', { name: 'Spicy' })
    await spicy.focus()
    await page.keyboard.press('Space')
    await expect(spicy).toBeChecked()
    const outline = await page
      .locator('label', { has: spicy })
      .evaluate((el) => getComputedStyle(el).outlineStyle)
    expect(outline).not.toBe('none')
  })
})

test.describe('responsive (TC-RESP-005)', () => {
  for (const width of WIDTHS)
    test(`no horizontal scroll and 48 px targets at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      for (const path of ['/help-me-choose?mood=meal&tags=CHEESY', '/menu/classic-veg-burger']) {
        await gotoReady(page, path)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          path,
        ).toBeLessThanOrEqual(width)
        if (width < 1024) {
          const small = await page
            .locator('form[aria-label="Help me choose"] label, [data-testid="reco-section"] a')
            .evaluateAll((els) =>
              els.filter((e) => e.getBoundingClientRect().height < 47.5).map((e) => e.textContent),
            )
          expect(small, path).toEqual([])
        }
      }
    })
})

test.describe('visual baselines (TC-VIS-101…104)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'baselines are recorded in Chromium')
  test.skip(process.platform !== 'darwin', 'visual baselines are recorded on macOS')

  for (const [name, path] of [
    ['choose-start', '/help-me-choose'],
    ['choose-results', '/help-me-choose?mood=meal&budget=100-200&tags=CHEESY'],
  ] as const)
    for (const [device, width, height] of [
      ['desktop', 1440, 900],
      ['mobile', 390, 844],
    ] as const)
      test(`${name} ${device}`, async ({ page }) => {
        await page.setViewportSize({ width, height })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await gotoReady(page, path)
        await page.evaluate(() => document.fonts.ready)
        await expect(page).toHaveScreenshot(`${name}-${device}.png`, {
          fullPage: true,
          // The order of equally good matches depends on the time of day (daypart), so the
          // result cards are masked; their content is checked by the tests above.
          mask: [
            page.locator('[data-volatile]'),
            page.getByText(/Open today|Closed today|Open now|Closed now/),
            page.getByRole('main').getByTestId('suggestion'),
          ],
          maxDiffPixelRatio: 0.01,
        })
      })
})
