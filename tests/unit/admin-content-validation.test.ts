import { describe, expect, it } from 'vitest'
import {
  bannerInputSchema,
  cafeInputSchema,
  galleryInputSchema,
  hhmmToMinutes,
  isSafeHref,
  isSocialUrl,
  offerInputSchema,
  offerItemsFromForm,
  parseHoursForm,
  parseIstDateTime,
  toIstInput,
} from '@/lib/validation/admin-content'

const ITEM = 'cmf0000000000000000000001'
const ITEM2 = 'cmf0000000000000000000002'

describe('safe links (TC-UNIT-040, TC-SEC-050)', () => {
  it.each([
    '/offers',
    '/menu?category=pizza&offers=1',
    '/menu/paneer-wrap#details',
    'https://www.instagram.com/zorko',
    'http://example.com/page',
  ])('accepts %s', (v) => expect(isSafeHref(v)).toBe(true))
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'https://user:pass@evil.example',
    'ftp://example.com',
    'offers',
    'java\tscript:alert(1)',
    '/menu\nSet-Cookie: x',
    '',
  ])('rejects %j', (v) => expect(isSafeHref(v)).toBe(false))
})

describe('social links (TC-UNIT-041)', () => {
  it('accepts only https links on the network’s own domain with a path', () => {
    expect(isSocialUrl('https://www.instagram.com/zorko.sangli', 'instagram')).toBe(true)
    expect(isSocialUrl('https://facebook.com/zorko', 'facebook')).toBe(true)
    expect(isSocialUrl('http://instagram.com/zorko', 'instagram')).toBe(false)
    expect(isSocialUrl('https://instagram.com.evil.example/zorko', 'instagram')).toBe(false)
    expect(isSocialUrl('https://evil.example/instagram.com', 'instagram')).toBe(false)
    expect(isSocialUrl('https://instagram.com/', 'instagram')).toBe(false)
    expect(isSocialUrl('https://facebook.com/zorko', 'instagram')).toBe(false)
  })
})

describe('India-time dates', () => {
  it('reads datetime-local values as IST and writes them back', () => {
    const d = parseIstDateTime('2026-10-16T18:30')!
    expect(d.toISOString()).toBe('2026-10-16T13:00:00.000Z')
    expect(toIstInput(d)).toBe('2026-10-16T18:30')
    expect(parseIstDateTime('2026-02-31T10:00')).toBeNull()
    expect(parseIstDateTime('2026-10-16 18:30')).toBeNull()
    expect(toIstInput(null)).toBe('')
  })
})

const offer = {
  kind: 'COMBO',
  title: 'Burger + Fries',
  description: 'A burger and fries together.',
  promoPrice: '199',
  startsAt: '2026-10-16T10:00',
  endsAt: '2026-11-16T10:00',
  isPublished: 'on',
  items: [{ menuItemId: ITEM, quantity: 1 }],
}

describe('offer input (TC-UNIT-020, TC-ADM-020)', () => {
  it('accepts a combo and converts the price; drops fields an admin may not set', () => {
    const r = offerInputSchema.parse({ ...offer, slug: 'x', isDemo: 'true', expiredAt: 'now' })
    expect(r.promoPricePaise).toBe(19900)
    expect(r.isPublished).toBe(true)
    expect(r).not.toHaveProperty('slug')
    expect(r).not.toHaveProperty('isDemo')
    expect(r).not.toHaveProperty('expiredAt')
  })
  it.each([
    ['end before start', { endsAt: '2026-10-15T10:00' }, 'endsAt'],
    ['end equal to start', { endsAt: '2026-10-16T10:00' }, 'endsAt'],
    ['invalid date', { startsAt: '2026-13-01T10:00' }, 'startsAt'],
    ['combo without items', { items: [] }, 'items'],
    [
      'duplicate items',
      {
        items: [
          { menuItemId: ITEM, quantity: 1 },
          { menuItemId: ITEM, quantity: 2 },
        ],
      },
      'items',
    ],
    ['zero price', { promoPrice: '0' }, 'promoPrice'],
    ['missing price', { promoPrice: '' }, 'promoPrice'],
    ['price on an info offer', { kind: 'INFO', promoPrice: '50' }, 'promoPrice'],
    ['unknown kind', { kind: 'FREE' }, 'kind'],
  ])('rejects %s', (_l, patch, field) => {
    const r = offerInputSchema.safeParse({ ...offer, ...patch })
    expect(r.success).toBe(false)
    expect(r.error!.issues.map((i) => i.path[0])).toContain(field)
  })
  it('info offers have no price and need no items', () => {
    const r = offerInputSchema.parse({ ...offer, kind: 'INFO', promoPrice: '', items: [] })
    expect(r.promoPricePaise).toBeNull()
  })
  it('reads item quantities from the form (0 = not included, junk ids rejected later)', () => {
    const items = offerItemsFromForm([
      ['qty_' + ITEM, '2'],
      ['qty_' + ITEM2, '0'],
      ['title', 'x'],
    ])
    expect(items).toEqual([{ menuItemId: ITEM, quantity: 2 }])
    const bad = offerItemsFromForm([["qty_x' OR 1=1", '1']])
    expect(offerInputSchema.safeParse({ ...offer, items: bad }).success).toBe(false)
    expect(
      offerInputSchema.safeParse({ ...offer, items: [{ menuItemId: ITEM, quantity: 21 }] }).success,
    ).toBe(false)
  })
})

describe('banner input (TC-UNIT-040)', () => {
  const banner = {
    title: 'Weekend combos',
    altText: 'Burger and fries on a tray',
    isPublished: 'on',
  }
  it('accepts no button, or both button text and a safe link', () => {
    expect(bannerInputSchema.safeParse(banner).success).toBe(true)
    expect(
      bannerInputSchema.safeParse({ ...banner, ctaLabel: 'View offers', ctaHref: '/offers' })
        .success,
    ).toBe(true)
  })
  it('rejects javascript: links, half-filled buttons and reversed dates', () => {
    const js = bannerInputSchema.safeParse({
      ...banner,
      ctaLabel: 'Go',
      ctaHref: 'javascript:alert(1)',
    })
    expect(js.success).toBe(false)
    expect(bannerInputSchema.safeParse({ ...banner, ctaLabel: 'Go' }).success).toBe(false)
    expect(
      bannerInputSchema.safeParse({
        ...banner,
        startsAt: '2026-10-20T10:00',
        endsAt: '2026-10-19T10:00',
      }).success,
    ).toBe(false)
  })
})

describe('café input (TC-UNIT-041, TC-ADM-030)', () => {
  const cafe = { name: 'ZORKO Sangli', addressLine: '100 Feet Rd, Vishrambag', city: 'Sangli' }
  it('accepts a minimal record; empty optionals become null', () => {
    const r = cafeInputSchema.parse({ ...cafe, phone: '', instagramUrl: '' })
    expect(r.phone).toBeNull()
    expect(r.instagramUrl).toBeNull()
    expect(r.latitude).toBeNull()
  })
  it('accepts valid contact, links and coordinates', () => {
    const r = cafeInputSchema.parse({
      ...cafe,
      postalCode: '416415',
      phone: '+91 98765 43210',
      email: 'hello@example.com',
      whatsappNumber: '919876543210',
      instagramUrl: 'https://instagram.com/zorko',
      facebookUrl: 'https://www.facebook.com/zorko',
      latitude: '16.845262',
      longitude: '74.596347',
      aboutText: 'Line one\r\n\r\n\r\n\r\nLine two',
    })
    expect(r.latitude).toBe(16.845262)
    expect(r.aboutText).toBe('Line one\n\nLine two')
  })
  it.each([
    ['PIN', { postalCode: '4164' }, 'postalCode'],
    ['phone letters', { phone: 'call me' }, 'phone'],
    ['email', { email: 'not-an-email' }, 'email'],
    ['WhatsApp with +', { whatsappNumber: '+919876543210' }, 'whatsappNumber'],
    ['javascript: Instagram', { instagramUrl: 'javascript:alert(1)' }, 'instagramUrl'],
    ['other host as Facebook', { facebookUrl: 'https://evil.example/facebook' }, 'facebookUrl'],
    ['latitude out of range', { latitude: '91', longitude: '74' }, 'latitude'],
    ['only one coordinate', { latitude: '16.8' }, 'longitude'],
    ['text too long', { aboutText: 'x'.repeat(1001) }, 'aboutText'],
  ])('rejects %s', (_l, patch, field) => {
    const r = cafeInputSchema.safeParse({ ...cafe, ...patch })
    expect(r.success).toBe(false)
    expect(r.error!.issues.map((i) => i.path[0])).toContain(field)
  })
})

describe('opening hours (TC-ADM-031)', () => {
  const form = (patch: Record<string, string> = {}) => {
    const f = new FormData()
    for (let d = 0; d < 7; d++) {
      f.set(`opens_${d}`, '10:00')
      f.set(`closes_${d}`, '22:00')
    }
    for (const [k, v] of Object.entries(patch)) f.set(k, v)
    return f
  }
  it('parses seven days; closed days need no times; 00:00 closing means midnight', () => {
    const r = parseHoursForm(form({ closed_1: 'on', closes_5: '00:00' }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.days).toHaveLength(7)
    expect(r.days[1]).toMatchObject({ isClosed: true })
    expect(r.days[5]).toMatchObject({ opensAtMin: 600, closesAtMin: 1440 })
  })
  it('rejects closing before opening and garbage times, naming the day', () => {
    const r = parseHoursForm(form({ opens_2: '23:00', closes_2: '09:00', opens_3: '25:00' }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.day_2).toMatch(/^Tuesday/)
    expect(r.errors.day_3).toMatch(/^Wednesday/)
  })
  it('HH:MM parsing', () => {
    expect(hhmmToMinutes('09:30')).toBe(570)
    expect(hhmmToMinutes('24:00')).toBeNull()
    expect(hhmmToMinutes('24:00', true)).toBe(1440)
    expect(hhmmToMinutes('9:30')).toBeNull()
  })
})

describe('gallery input', () => {
  it('requires alt text; caption optional', () => {
    expect(galleryInputSchema.safeParse({ altText: 'Seating area by the window' }).success).toBe(
      true,
    )
    expect(galleryInputSchema.safeParse({ altText: 'x' }).success).toBe(false)
  })
})
