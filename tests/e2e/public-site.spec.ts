import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Phase 4A — public site core (homepage, digital menu, item details, header/footer).
 * Runs against the seeded local test database (scripts/test-db.sh), production build.
 */

const PAGES = [
  '/',
  '/menu',
  '/menu/classic-veg-burger',
  '/offers',
  '/offers/burger-fries-combo',
  '/student-zone',
  '/gallery',
  '/contact',
  '/offers/weekend-dessert-special',
  '/credits',
] as const
const BASE = 'http://localhost:3100' // playwright.config.ts baseURL / NEXT_PUBLIC_SITE_URL
const WIDTHS = [375, 430, 768, 1024, 1440]

async function axeSeriousOrCritical(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

/** Navigate and wait until the page is idle, so React has hydrated before the test interacts. */
async function gotoReady(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
}

const cardNames = (page: Page) => page.getByTestId('menu-card').getByRole('heading').allInnerTexts()

test.describe('homepage (TC-E2E-001)', () => {
  test('shows real data sections and no links to pages that do not exist yet', async ({ page }) => {
    await gotoReady(page, '/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ZORKO Sangli')
    await expect(page.getByRole('note')).toContainText('Demo data') // FR-024 demo labelling
    // Real count of public items (17 seeded, 1 unpublished).
    await expect(page.getByText('items on the menu')).toBeVisible()
    await expect(page.getByText('16', { exact: true })).toBeVisible()
    // Categories with real counts link to the filtered menu.
    const burgers = page.getByRole('link', { name: /Burgers\s+3 items/ })
    await expect(burgers).toHaveAttribute('href', '/menu?category=burgers')
    // Popular picks: at most 4 (ADR-023), only best sellers / trending.
    const picks = page.locator('section', { hasText: 'Popular Picks' }).getByTestId('menu-card')
    await expect(picks).toHaveCount(4)
    // Featured combo comes from an active offer; expired/draft offers never appear.
    await expect(page.getByRole('heading', { name: 'Burger + Fries + Coffee Combo' })).toBeVisible()
    await expect(page.getByText('Old Pasta Offer')).toHaveCount(0)
    await expect(page.getByText('Draft Offer')).toHaveCount(0)
    // No mockup claims (CLAUDE.md §6.2) and no ordering UI (§6.3).
    for (const banned of [
      /100% VEG/i,
      /Add to Order/i,
      /Table QR/i,
      /4\.8\/5/,
      /Certified/i,
      /Wi-?Fi/i,
    ]) {
      await expect(page.getByText(banned)).toHaveCount(0)
    }
    // Unverified hours are labelled.
    await expect(page.getByText(/to be confirmed/).first()).toBeVisible()
  })

  test('every internal link on the core pages resolves (no dead links)', async ({
    page,
    request,
  }) => {
    const hrefs = new Set<string>()
    for (const path of PAGES) {
      await gotoReady(page, path)
      for (const href of await page
        .locator('a[href^="/"]')
        .evaluateAll((as) => as.map((a) => a.getAttribute('href')!)))
        hrefs.add(href.split('#')[0])
    }
    const results = await Promise.all(
      [...hrefs].map(async (href) => [href, (await request.get(href)).status()] as const),
    )
    expect(results.filter(([, status]) => status !== 200)).toEqual([])
  })
})

test('image credits page lists every illustrative photo with its licence (ADR-045)', async ({
  page,
}) => {
  await page.goto('/credits')
  await expect(page.getByRole('heading', { level: 1, name: 'Image credits' })).toBeVisible()
  const items = page.getByRole('main').getByRole('listitem')
  expect(await items.count()).toBeGreaterThanOrEqual(20)
  await expect(items.first()).toContainText(/CC0|Public domain|CC BY/)
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: 'Image credits' }),
  ).toHaveAttribute('href', '/credits')
})

test.describe('digital menu (TC-E2E-010…013)', () => {
  test('combined filters from the URL: search + category + price band', async ({ page }) => {
    await gotoReady(page, '/menu?q=burger&category=burgers&price=100-200')
    await expect(page.getByText('Showing 2 items')).toBeVisible()
    expect(await cardNames(page)).toEqual(['Paneer Tikka Burger', 'Double Cheese Burger'])
    // Active filter chips can be removed one by one.
    await page.getByRole('link', { name: 'Remove filter: ₹100–₹200' }).click()
    await expect(page.getByText('Showing 3 items')).toBeVisible()
    await expect(page).toHaveURL(/q=burger&category=burgers$/)
  })

  test('price band boundaries are inclusive/exclusive as specified (TC-UNIT-012 end to end)', async ({
    page,
  }) => {
    const prices = async () =>
      (await page.getByTestId('menu-card').locator('.text-title-price').allInnerTexts()).map((t) =>
        Number(t.replace(/[₹,]/g, '')),
      )
    await gotoReady(page, '/menu?price=under-100&pageSize=48')
    expect((await prices()).every((p) => p < 100)).toBe(true)
    await gotoReady(page, '/menu?price=100-200')
    const mid = await prices()
    expect(mid.every((p) => p >= 100 && p <= 200)).toBe(true)
    expect(mid).toContain(199) // upper edge inside the band
    await gotoReady(page, '/menu?price=200-plus')
    expect((await prices()).every((p) => p > 200)).toBe(true)
  })

  test('typing in search filters after a short pause and keeps other filters', async ({ page }) => {
    await gotoReady(page, '/menu?category=pizza')
    await page.getByRole('searchbox', { name: 'Search the menu' }).last().fill('farm')
    await expect(page).toHaveURL(/category=pizza/)
    await expect(page).toHaveURL(/q=farm/)
    await expect.poll(() => cardNames(page)).toEqual(['Farmhouse Pizza'])
  })

  test('desktop filters and sort apply immediately and combine', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop aside')
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoReady(page, '/menu')
    await page.getByRole('checkbox', { name: /Popular only/ }).check()
    await expect(page).toHaveURL(/popular=1/)
    await page.getByRole('form', { name: 'Sort' }).getByLabel('Sort').selectOption('price_asc')
    await expect(page).toHaveURL(/popular=1.*sort=price_asc|sort=price_asc.*popular=1/)
    const prices = (
      await page.getByTestId('menu-card').locator('.text-title-price').allInnerTexts()
    ).map((t) => Number(t.replace(/[₹,]/g, '')))
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
    await page.getByRole('link', { name: 'Clear all' }).click()
    await expect(page).toHaveURL(/\/menu$/)
  })

  test('mobile: category pills and the filter sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoReady(page, '/menu')
    await page
      .getByRole('navigation', { name: 'Categories' })
      .getByRole('link', { name: 'Snacks' })
      .click()
    await expect(page).toHaveURL(/category=snacks/)
    await page.getByRole('button', { name: /Filters/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Filters and sort' })
    await sheet.getByRole('checkbox', { name: /Offers only/ }).check()
    await sheet.getByRole('button', { name: 'Apply' }).click()
    await expect(page).toHaveURL(/category=snacks.*offers=1/)
    await expect.poll(() => cardNames(page)).toEqual(['French Fries', 'Peri Peri Fries'])
    await expect(page.getByRole('button', { name: /Filters/ })).toContainText('1')
  })

  test('empty state offers to clear filters; invalid URL values are ignored, not errors', async ({
    page,
  }) => {
    await gotoReady(page, '/menu?q=zzzz-nothing')
    await expect(page.getByRole('heading', { name: 'No dishes match these filters' })).toBeVisible()
    await page.getByRole('link', { name: 'Clear all filters' }).click()
    await expect(page.getByText('Showing 16 items')).toBeVisible()
    const res = await page.goto('/menu?pageSize=999&price=bogus&sort=evil&category=Bad%20Slug')
    expect(res?.status()).toBe(200)
    await expect(page.getByText('Showing 16 items')).toBeVisible()
  })

  test('pagination and out-of-stock items (TC-E2E-021)', async ({ page }) => {
    await gotoReady(page, '/menu')
    await page
      .getByRole('navigation', { name: 'Pagination' })
      .getByRole('link', { name: /Next/ })
      .click()
    await expect(page).toHaveURL(/page=2/)
    const soldOut = page.getByTestId('menu-card').filter({ hasText: 'Double Cheese Burger' })
    await expect(soldOut.getByText('Out of stock').first()).toBeVisible()
    // Unpublished items never appear.
    await gotoReady(page, '/menu?q=pink')
    await expect(page.getByText('Showing 0 items')).toBeVisible()
  })

  test('grid/list toggle keeps the filters', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await gotoReady(page, '/menu?category=pasta')
    await page.getByRole('button', { name: 'List' }).click()
    await expect(page).toHaveURL(/category=pasta.*view=list/)
    await expect(page.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('item details (TC-E2E-020)', () => {
  test('shows details, add-ons as information, related items and combos; no ordering UI', async ({
    page,
  }) => {
    await gotoReady(page, '/menu/margherita-pizza')
    await expect(page.getByRole('heading', { level: 1, name: 'Margherita Pizza' })).toBeVisible()
    await expect(page.getByText('Available now')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Customisations available/ })).toBeVisible()
    await expect(page.getByText('Cheese burst')).toBeVisible()
    await expect(page.getByText(/Part of the offer/)).toContainText('Pizza Duo Deal')
    for (const banned of [/Add to/i, /Order/, /Quantity/i, /Checkout/i])
      await expect(page.getByRole('button', { name: banned })).toHaveCount(0)
    await page.getByRole('link', { name: /Cheese Garlic Bread/ }).click()
    await expect(page).toHaveURL(/\/menu\/cheese-garlic-bread$/)
  })

  test('out-of-stock item is clearly labelled', async ({ page }) => {
    await gotoReady(page, '/menu/double-cheese-burger')
    await expect(page.getByText('Out of stock').first()).toBeVisible()
    await expect(page.getByText('Available now')).toHaveCount(0)
  })

  test('"Back to menu" restores the filters the visitor came from', async ({ page }) => {
    await gotoReady(page, '/menu?category=burgers&sort=price_desc')
    await page.getByRole('link', { name: 'Paneer Tikka Burger' }).click()
    await expect(page).toHaveURL(/paneer-tikka-burger/)
    await page.getByRole('link', { name: 'Back to menu' }).click()
    await expect(page).toHaveURL(/\/menu\?category=burgers&sort=price_desc$/)
  })

  test('zoom opens a dialog that closes with Escape and returns focus', async ({ page }) => {
    await gotoReady(page, '/menu/classic-veg-burger')
    const zoom = page.getByRole('button', { name: /Enlarge image/ })
    await zoom.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Classic Veg Burger' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(zoom).toBeFocused()
  })

  test('unknown or unpublished items show a friendly not-found page, excluded from search engines', async ({
    page,
  }) => {
    for (const path of ['/menu/no-such-dish', '/menu/pink-sauce-pasta', '/menu/BAD..slug']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: "This dish isn't on the menu" })).toBeVisible()
      // Streaming (partial prerendering) has already sent 200, so Next.js marks the page noindex (ADR-041).
      await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', /noindex/)
      await expect(page.getByRole('link', { name: 'Browse the menu' })).toHaveAttribute(
        'href',
        '/menu',
      )
    }
  })
})

test.describe('offers & combos (TC-E2E-030, TC-INT-030 end to end)', () => {
  test('lists active combos and deals, a scheduled offer, never expired or draft ones', async ({
    page,
  }) => {
    await gotoReady(page, '/offers')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Offers & Combo Feasts')
    await expect(page.getByText('3 active offers')).toBeVisible()
    const titles = await page.getByTestId('offer-card').getByRole('heading').allInnerTexts()
    expect(titles).toEqual([
      'Burger + Fries + Coffee Combo',
      'Student Snack Box',
      'Pizza Duo Deal',
      'Dessert Special (scheduled)',
    ])
    await expect(page.getByText(/Old Pasta Offer|Draft Offer/)).toHaveCount(0)
    // Prices, saving and % off come from the database (₹267 − ₹229 = ₹38, 14%).
    const combo = page.getByTestId('offer-card').first()
    await expect(combo).toContainText('₹229')
    await expect(combo).toContainText('Save ₹38')
    await expect(combo).toContainText('14% off')
    // No voucher, coupon or ordering UI (CLAUDE.md §6.3).
    for (const banned of [/Claim/i, /Copy code/i, /coupon/i, /Add to/i])
      await expect(page.getByText(banned)).toHaveCount(0)
  })

  test('tabs filter in the URL; Student shows only student offers', async ({ page }) => {
    await gotoReady(page, '/offers')
    await page
      .getByRole('navigation', { name: 'Offer types' })
      .getByRole('link', { name: 'Student' })
      .click()
    await expect(page).toHaveURL(/tab=student/)
    await expect
      .poll(() => page.getByTestId('offer-card').getByRole('heading').allInnerTexts())
      .toEqual(['Student Snack Box'])
    // Item deals: the active deal, plus the scheduled dessert deal under "Coming soon".
    await gotoReady(page, '/offers?tab=deals')
    expect(await page.getByTestId('offer-card').getByRole('heading').allInnerTexts()).toEqual([
      'Pizza Duo Deal',
      'Dessert Special (scheduled)',
    ])
    // Unknown tab values fall back to "All".
    await gotoReady(page, '/offers?tab=evil')
    await expect(page.getByRole('link', { name: 'All', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('offer details: included items link to the menu; scheduled shows its start date', async ({
    page,
  }) => {
    await gotoReady(page, '/')
    await page.getByRole('link', { name: 'View offer', exact: true }).click()
    await expect(page).toHaveURL(/\/offers\/burger-fries-combo$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Burger + Fries + Coffee Combo' }),
    ).toBeVisible()
    await expect(page.getByText('You save ₹38')).toBeVisible()
    await page.getByRole('link', { name: /1× French Fries/ }).click()
    await expect(page).toHaveURL(/\/menu\/french-fries$/)
    // Wait for the dish page to finish rendering before navigating again (WebKit race).
    await expect(page.getByRole('heading', { level: 1, name: 'French Fries' })).toBeVisible()
    await gotoReady(page, '/offers/weekend-dessert-special')
    await expect(page.getByText(/^Starts /)).toBeVisible()
    await expect(page.getByText('Active now')).toHaveCount(0)
  })

  test('expired, unpublished and unknown offers show the not-found page', async ({ page }) => {
    for (const path of ['/offers/old-pasta-offer', '/offers/draft-offer', '/offers/nope']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: "This offer isn't available" })).toBeVisible()
    }
  })
})

test.describe('student zone (TC-E2E-031)', () => {
  test('shows only student offers, the intro text and the no-verification notice', async ({
    page,
  }) => {
    await gotoReady(page, '/')
    await page.getByRole('link', { name: 'Explore Student Zone' }).click()
    await expect(page).toHaveURL(/\/student-zone$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Student Offers')
    await expect(
      page
        .getByRole('main')
        .getByText(
          'Demo text: Student Zone offers are information only. No student ID check exists.',
          { exact: true },
        ),
    ).toBeVisible() // admin-editable intro text
    await expect(
      page.getByText('this website does not verify student status', { exact: false }),
    ).toBeVisible()
    expect(await page.getByTestId('offer-card').getByRole('heading').allInnerTexts()).toEqual([
      'Student Snack Box',
    ])
    // No student-ID check, voucher or ordering UI (CLAUDE.md §3.1 D, §6.3).
    for (const banned of [/upload.*id/i, /verify your/i, /Claim/i, /coupon/i, /Add to/i])
      await expect(page.getByText(banned)).toHaveCount(0)
    await page.getByRole('link', { name: 'Student Snack Box' }).click()
    await expect(page).toHaveURL(/\/offers\/student-snack-box$/)
  })
})

test.describe('gallery (TC-E2E-040: empty state; lightbox keys in TC-COMP-010)', () => {
  test('is linked from the navigation and shows an empty state until photos are published', async ({
    page,
  }) => {
    await gotoReady(page, '/student-zone')
    await page.getByRole('contentinfo').getByRole('link', { name: 'Gallery' }).click()
    await expect(page).toHaveURL(/\/gallery$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Gallery' })).toBeVisible()
    // The test fixtures have no published photos (lightbox: tests/component/gallery-grid.test.tsx).
    await expect(page.getByRole('heading', { name: 'No photos yet' })).toBeVisible()
    await page.getByRole('link', { name: 'Browse the menu' }).click()
    await expect(page).toHaveURL(/\/menu$/)
  })
})

test.describe('gallery on mobile', () => {
  test('the bottom nav "More" sheet links to the gallery', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoReady(page, '/')
    await page
      .getByRole('navigation', { name: 'Bottom' })
      .getByRole('button', { name: 'More' })
      .click()
    await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: 'Gallery' }).click()
    await expect(page).toHaveURL(/\/gallery$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('about & contact (TC-E2E-041)', () => {
  test('shows hours with today highlighted and labels unconfirmed details', async ({ page }) => {
    await gotoReady(page, '/')
    await page.getByRole('contentinfo').getByRole('link', { name: 'About & Contact' }).click()
    await expect(page).toHaveURL(/\/contact$/)
    await expect(page.getByRole('heading', { level: 1, name: 'About & Contact' })).toBeVisible()
    // Fixture address and hours are unverified: labelled, never presented as fact.
    await expect(page.getByRole('main').getByText('To be confirmed', { exact: true })).toHaveCount(
      2,
    )
    await expect(page.getByText('Address to be confirmed by the café')).toHaveCount(0)
    // 7 days; exactly one row is today.
    const rows = page.getByRole('table').getByRole('row')
    await expect(rows).toHaveCount(7)
    await expect(page.locator('tr[aria-current="date"]')).toHaveCount(1)
    await expect(page.locator('tr[aria-current="date"]')).toContainText('(today)')
    // No unverified address is sent to Google: no map, no directions (ADR-046).
    await expect(page.locator('iframe')).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Get directions/ })).toHaveCount(0)
    // About text from the database.
    await expect(
      page.getByText('Demo text: replace with the café’s approved description.'),
    ).toBeVisible()
    // Phase 6: the feedback page exists, so the contact page links to it.
    await expect(page.getByRole('link', { name: 'Share feedback' })).toHaveAttribute(
      'href',
      '/feedback',
    )
  })
})

test.describe('SEO: metadata, sitemap and robots (TC-E2E-045)', () => {
  test('pages have a title, description, canonical and Open Graph tags', async ({ page }) => {
    await page.goto('/menu/classic-veg-burger')
    await expect(page).toHaveTitle('Classic Veg Burger | ZORKO Sangli')
    const meta = (sel: string) => page.locator(sel).first().getAttribute('content')
    expect(await meta('meta[name="description"]')).toContain('vegetable patty')
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(
      `${BASE}/menu/classic-veg-burger`,
    )
    expect(await meta('meta[property="og:site_name"]')).toBe('ZORKO Sangli')
    expect(await meta('meta[property="og:url"]')).toBe(`${BASE}/menu/classic-veg-burger`)
    expect(await meta('meta[property="og:image"]')).toMatch(/^http:\/\/localhost:3100\/demo\//)
    expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image')
    // A page without its own image falls back to the default share image.
    await page.goto('/gallery')
    expect(await meta('meta[property="og:image"]')).toBe(`${BASE}/og-default.jpg`)
    expect((await page.request.get('/og-default.jpg')).status()).toBe(200)
  })

  test('missing pages are noindex', async ({ page }) => {
    for (const path of ['/menu/nope', '/offers/nope', '/no-such-page']) {
      await page.goto(path)
      await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
        'content',
        /noindex/,
      )
    }
  })

  test('sitemap.xml lists live pages and visible details only; robots.txt points to it', async ({
    request,
  }) => {
    const res = await request.get('/sitemap.xml')
    expect(res.status()).toBe(200)
    const urls = [...(await res.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])
    for (const path of [
      '/',
      '/menu',
      '/offers',
      '/student-zone',
      '/gallery',
      '/contact',
      '/feedback',
      '/qr',
    ])
      expect(urls).toContain(`${BASE}${path}`)
    expect(urls).toContain(`${BASE}/menu/classic-veg-burger`)
    expect(urls).toContain(`${BASE}/offers/burger-fries-combo`)
    expect(urls).toContain(`${BASE}/offers/weekend-dessert-special`) // scheduled: page exists
    // Never: unpublished items, expired or draft offers, admin or API routes.
    for (const hidden of ['pink-sauce-pasta', 'old-pasta-offer', 'draft-offer', '/admin', '/api/'])
      expect(urls.join(' ')).not.toContain(hidden)
    // Every listed page really exists.
    for (const u of urls) expect((await request.get(u)).status(), u).toBe(200)

    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).toContain('Disallow: /api/')
    expect(robots).toContain('Disallow: /dev/')
    expect(robots).toContain(`Sitemap: ${BASE}/sitemap.xml`)
  })
})

test.describe('navigation, accessibility and responsive (TC-A11Y-001, TC-RESP-001…003)', () => {
  for (const path of PAGES) {
    for (const width of [390, 768, 1440]) {
      test(`axe: no serious/critical violations on ${path} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await gotoReady(page, path)
        expect(await axeSeriousOrCritical(page)).toEqual([])
      })
    }
  }

  for (const width of WIDTHS) {
    test(`no horizontal scroll on core pages at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      for (const path of [...PAGES, '/menu?view=list']) {
        await gotoReady(page, path)
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        )
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0)
      }
    })
  }

  test('touch targets are at least 48px under 1024px on core pages (TC-RESP-002)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 })
    for (const path of PAGES) {
      await gotoReady(page, path)
      const small = await page.evaluate(() => {
        const out: string[] = []
        document
          .querySelectorAll<HTMLElement>(
            'main a[href], main button, main input, main select, nav[aria-label="Bottom"] a',
          )
          .forEach((el) => {
            let target: Element = el
            if (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type))
              target = el.closest('label') ?? el
            if (el.hasAttribute('data-stretched-link')) target = el.closest('article') ?? el
            const r = target.getBoundingClientRect()
            if (r.width === 0 && r.height === 0) return
            if (el.closest('dialog:not([open])')) return
            if (r.height < 47.5 || r.width < 47.5)
              out.push(
                `${el.tagName} "${(el.textContent ?? '').trim().slice(0, 25)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
              )
          })
        return out
      })
      expect(small, path).toEqual([])
    }
  })

  test('header: active nav state, header search, mobile bottom nav', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoReady(page, '/menu/classic-veg-burger')
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Digital Menu' }),
    ).toHaveAttribute('aria-current', 'page')
    await page.getByRole('searchbox', { name: 'Search the menu' }).first().fill('coffee')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/menu\?q=coffee/)
    await expect.poll(() => cardNames(page)).toEqual(['Cold Coffee'])

    await page.setViewportSize({ width: 390, height: 844 })
    await gotoReady(page, '/')
    const bottom = page.getByRole('navigation', { name: 'Bottom' })
    await expect(bottom.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    await bottom.getByRole('link', { name: 'Menu' }).click()
    await expect(page).toHaveURL(/\/menu$/)
  })

  test('keyboard only: skip link, offer tabs and a detail page (TC-A11Y-003)', async ({
    page,
    browserName,
  }) => {
    // Safari moves Tab between links only with Option+Tab (its default setting); Chrome with Tab.
    const TAB = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoReady(page, '/offers')
    await page.keyboard.press(TAB)
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#main$/)
    // Tabs are plain links: reachable with Tab and activated with Enter.
    const student = page.getByRole('navigation', { name: 'Offer types' }).getByRole('link', {
      name: 'Student',
    })
    await student.focus()
    await expect(student).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/tab=student/)
    const card = page.getByRole('link', { name: 'Student Snack Box' })
    await card.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/offers\/student-snack-box$/)
    // A visible focus indicator (UI_SPEC §11): the focused element has an outline or ring.
    await page.keyboard.press(TAB)
    const visible = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return false
      const cs = getComputedStyle(el)
      return cs.outlineStyle !== 'none' || cs.boxShadow !== 'none'
    })
    expect(visible).toBe(true)
  })

  test('tablet drawer opens, traps focus and navigates', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await gotoReady(page, '/')
    await page.getByRole('button', { name: 'Open menu' }).click()
    const drawer = page.getByRole('dialog', { name: 'Menu' })
    await drawer.getByRole('link', { name: 'Digital Menu' }).click()
    await expect(page).toHaveURL(/\/menu$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('visual baselines (TC-VIS-001…003)', () => {
  // Chromium only: one engine is enough for pixel baselines; other checks run on both.
  test.skip(({ browserName }) => browserName !== 'chromium', 'baselines are recorded in Chromium')
  // Font rendering differs per OS; baselines exist for macOS only until Linux ones are recorded
  // for CI (PROGRESS backlog). Reported as skipped on Linux, never as passed.
  test.skip(process.platform !== 'darwin', 'visual baselines are recorded on macOS')

  for (const [name, path] of [
    ['home', '/'],
    ['menu', '/menu'],
    ['item', '/menu/classic-veg-burger'],
    ['offers', '/offers'],
    ['student-zone', '/student-zone'],
    ['gallery', '/gallery'],
    ['contact', '/contact'],
    ['admin-login', '/admin/login'],
  ] as const) {
    for (const [device, width, height] of [
      ['desktop', 1440, 900],
      ['mobile', 390, 844],
    ] as const) {
      test(`${name} ${device}`, async ({ page }) => {
        await page.setViewportSize({ width, height })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await gotoReady(page, path)
        await page.evaluate(() => document.fonts.ready)
        await expect(page).toHaveScreenshot(`${name}-${device}.png`, {
          fullPage: true,
          // Time-dependent text (open/closed now, offer end dates relative to the seed) is masked.
          mask: [
            page.locator('[data-volatile]'),
            page.getByText(/Open today|Closed today|Open now|Closed now/),
          ],
          maxDiffPixelRatio: 0.01,
        })
      })
    }
  }
})
