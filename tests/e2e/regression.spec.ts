import { expect, test } from '@playwright/test'

/**
 * Whole-site regression checks (Phase 7, TC-E2E-090/091). Read-only, both engines.
 * 090: no ordering UI and none of the mockup claims CLAUDE.md §6.2/§6.3 forbid.
 * 091: no console errors and no failed requests on any public page.
 */
const PAGES = [
  '/',
  '/menu',
  '/menu?category=pizza&price=100-200',
  '/menu/classic-veg-burger',
  '/offers',
  '/offers/burger-fries-combo',
  '/student-zone',
  '/gallery',
  '/contact',
  '/feedback',
  '/qr',
  '/credits',
  '/admin/login',
]

const BANNED = [
  /add to (order|cart)/i,
  /\bADD \+/,
  /\bcheckout\b/i,
  /\bcart\b/i,
  /claim combo voucher/i,
  /table qr order/i,
  /self-order/i,
  /smart kiosk/i,
  /SANGLIZORKO|WEEKEND100/,
  /copy code/i,
  /auto-applied at billing/i,
  /100% pure veg certified/i,
  /hygiene pledge/i,
  /\b4\.8\s*\/\s*5\b/,
  /1,200\+ foodies/i,
  /live kitchen queue/i,
  /tables? open/i,
  /student id (verified|discount)/i,
  /loyalty points/i,
  /call caf[eé] staff/i,
  /© 2025 ZORKO/i,
]

for (const path of PAGES) {
  test(`no ordering UI or forbidden claims; no console errors or failed requests: ${path}`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 200))
    })
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`))
    page.on('response', (r) => {
      // Same-origin failures only (the Google map iframe is third-party and loads lazily).
      if (r.status() >= 400 && r.url().startsWith(new URL(page.url() || 'http://x').origin))
        errors.push(`${r.status()} ${r.url()}`)
    })
    page.on('requestfailed', (r) => {
      const url = r.url()
      if (!url.includes('google.com') && !r.failure()?.errorText.includes('ERR_ABORTED'))
        errors.push(`failed ${url} ${r.failure()?.errorText}`)
    })
    await page.goto(path, { waitUntil: 'networkidle' })
    const text = await page.locator('body').innerText()
    for (const pattern of BANNED) expect(text, `${path} shows ${pattern}`).not.toMatch(pattern)
    // No order controls of any kind: quantity steppers or "add" buttons.
    await expect(page.getByRole('button', { name: /^(add|\+|order)\b/i })).toHaveCount(0)
    await expect(page.getByRole('spinbutton')).toHaveCount(0)
    expect(errors, path).toEqual([])
  })
}
