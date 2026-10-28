import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const WIDTHS = [375, 430, 768, 1024, 1440]

/**
 * Safari/WebKit on macOS moves focus only between form fields with Tab by default;
 * Option+Tab moves through every control (as a Safari keyboard user would press).
 */
const tabKey = (browserName: string) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab')

async function axeSeriousOrCritical(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

test.describe('Style guide and UI foundation', () => {
  test('renders every section', async ({ page }) => {
    await page.goto('/dev/styleguide')
    for (const name of [
      'Colour tokens',
      'Typography',
      'Radii and elevation',
      'Buttons',
      'Form fields',
      'Pills, chips and badges',
      'Cards, prices and loading',
      'Empty state',
      'Dialogs, toasts, switch and error state',
      'Pagination',
      'Section heading',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
    }
  })

  test('design tokens are applied (primary colour, radii)', async ({ page }) => {
    await page.goto('/dev/styleguide')
    const primary = page.getByRole('button', { name: 'Primary' })
    // ADR-060: primary action = ZORKO orange #ff7916 with near-black text #211c19 (AA 6.43:1).
    expect(await primary.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgb(255, 121, 22)',
    )
    expect(await primary.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(33, 28, 25)')
    await primary.hover()
    await expect
      .poll(() => primary.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe('rgb(232, 102, 10)') // hover = cta-hover #e8660a
    // rounded-full is calc(infinity * 1px) in Tailwind 4; browsers clamp it to a huge px value.
    const radius = parseFloat(await primary.evaluate((el) => getComputedStyle(el).borderRadius))
    expect(radius).toBeGreaterThanOrEqual(9999)
  })

  for (const path of ['/', '/dev/styleguide', '/does-not-exist']) {
    test(`axe: no serious/critical violations on ${path} (TC-A11Y-001)`, async ({ page }) => {
      await page.goto(path)
      expect(await axeSeriousOrCritical(page)).toEqual([])
    })
  }

  for (const width of WIDTHS) {
    test(`no horizontal page scroll at ${width}px (TC-RESP-001)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      for (const path of ['/', '/dev/styleguide', '/does-not-exist']) {
        await page.goto(path)
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        )
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0)
      }
    })
  }

  test('touch targets are at least 48px under 1024px (TC-RESP-002)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto('/dev/styleguide')
    const small = await page.evaluate(() => {
      const offenders: string[] = []
      const els = document.querySelectorAll<HTMLElement>(
        'main a[href], main button, main input, main select, main textarea, main [role="switch"]',
      )
      els.forEach((el) => {
        // Checkbox/radio inputs are measured by their full-row <label>.
        const target =
          el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
            ? (el.closest('label') ?? el)
            : el
        const r = target.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) return // not rendered
        if (r.height < 47.5 || r.width < 47.5)
          offenders.push(
            `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
          )
      })
      return offenders
    })
    expect(small).toEqual([])
  })

  test('dialog traps focus, closes on Escape and restores focus (TC-COMP-006)', async ({
    page,
    browserName,
  }) => {
    await page.goto('/dev/styleguide')
    const opener = page.getByRole('button', { name: 'Open dialog' })
    // Open with the keyboard, as a keyboard user would (Safari does not focus buttons on click).
    await opener.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Dialog title' })
    await expect(dialog).toBeVisible()
    // Tab cycles within the modal: focus never lands outside it.
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press(tabKey(browserName))
      expect(
        await page.evaluate(() => Boolean(document.activeElement?.closest('dialog[open]'))),
      ).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
  })

  test('confirm dialog cancels and confirms with a toast', async ({ page }) => {
    await page.goto('/dev/styleguide')
    await page.getByRole('button', { name: 'Archive item…' }).click()
    const confirm = page.getByRole('dialog', { name: /Archive/ })
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirm).toBeHidden()
    await page.getByRole('button', { name: 'Archive item…' }).click()
    await confirm.getByRole('button', { name: 'Archive' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'archived' })).toBeVisible()
  })

  test('toasts announce success (status) and errors (alert) and can be dismissed', async ({
    page,
  }) => {
    await page.goto('/dev/styleguide')
    await page.getByRole('button', { name: 'Show success toast' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Changes saved' })).toBeVisible()
    await page.getByRole('button', { name: 'Show error toast' }).click()
    const alert = page.getByRole('alert').filter({ hasText: 'Could not save' })
    await expect(alert).toBeVisible()
    await alert.getByRole('button', { name: 'Dismiss notification' }).click()
    await expect(alert).toBeHidden()
  })

  test('switch toggles and reports state', async ({ page }) => {
    await page.goto('/dev/styleguide')
    const toggle = page.getByRole('switch', { name: 'Available: demo item' })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByText('Currently out of stock')).toBeVisible()
  })

  test('search field clear button empties the input', async ({ page }) => {
    await page.goto('/dev/styleguide')
    const input = page.getByRole('searchbox', { name: 'Search dishes' })
    await input.fill('paneer')
    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(input).toHaveValue('')
  })

  test('pagination links navigate and mark the current page', async ({ page }) => {
    await page.goto('/dev/styleguide')
    await page.getByRole('link', { name: 'Page 2' }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
  })

  test('reduced motion disables animations (TC-A11Y-005)', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/dev/styleguide')
    const duration = await page
      .locator('[aria-hidden="true"].motion-safe\\:animate-pulse, [aria-hidden="true"].rounded-xl')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName)
    expect(duration).toBe('none')
    await context.close()
  })

  test('keyboard: focus is visible on interactive elements', async ({ page, browserName }) => {
    await page.goto('/dev/styleguide')
    await page.getByRole('button', { name: 'Primary' }).focus()
    await page.keyboard.press(tabKey(browserName))
    await expect(page.getByRole('button', { name: 'Secondary' })).toBeFocused()
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement
      const s = getComputedStyle(el)
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }
    })
    expect(outline.style).not.toBe('none')
    expect(outline.width).toBeGreaterThanOrEqual(2)
  })
})
