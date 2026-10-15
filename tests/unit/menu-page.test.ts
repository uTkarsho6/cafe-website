import { describe, expect, it } from 'vitest'
import {
  activeFilterChips,
  menuHref,
  parseMenuParams,
  pickMenuParams,
} from '@/features/menu/menu-params'
import { formatHoursRange, formatTime12 } from '@/lib/format'
import { isActivePath, isLive, liveNav, NAV_ITEMS } from '@/lib/site/nav'
import { DEFAULT_OG_IMAGE, pageMetadata } from '@/lib/site/seo'
import { menuQuerySchema } from '@/lib/validation/public'
import { menuWhere } from '@/server/services/menu'

const now = new Date('2026-10-14T00:00:00Z')

describe('price bands (TC-UNIT-012)', () => {
  const where = (price: string) =>
    (menuWhere(menuQuerySchema.parse({ price }), now).AND as object[]).at(-1)
  it('Under ₹100 excludes ₹100 (₹99.99 is in)', () =>
    expect(where('under-100')).toEqual({ pricePaise: { lt: 10000 } }))
  it('₹100–₹200 includes both ends', () =>
    expect(where('100-200')).toEqual({ pricePaise: { gte: 10000, lte: 20000 } }))
  it('₹200+ starts above ₹200 (₹200.01 is in)', () =>
    expect(where('200-plus')).toEqual({ pricePaise: { gt: 20000 } }))
  it('rejects unknown bands', () =>
    expect(menuQuerySchema.safeParse({ price: '0-50' }).success).toBe(false))
})

describe('menu page URL state (UI_SPEC §12.2)', () => {
  it('keeps known keys only, first value of repeated keys', () => {
    expect(
      pickMenuParams({ q: ['a', 'b'], evil: 'x', category: 'pizza', page: undefined }),
    ).toEqual({
      q: 'a',
      category: 'pizza',
    })
  })
  it('drops invalid values one by one instead of failing the page', () => {
    const { query, params } = parseMenuParams({
      q: 'paneer',
      category: 'Bad Slug',
      price: 'bogus',
      sort: 'price_desc',
      page: '0',
      view: 'table',
    })
    expect(params).toEqual({ q: 'paneer', sort: 'price_desc' })
    expect(query).toMatchObject({ q: 'paneer', sort: 'price_desc', page: 1, pageSize: 12 })
  })
  it('builds hrefs that keep other filters and reset the page on filter changes', () => {
    const p = { q: 'burger', category: 'burgers', page: '2' }
    expect(menuHref(p, { price: '100-200' })).toBe('/menu?q=burger&category=burgers&price=100-200')
    expect(menuHref(p, { category: undefined })).toBe('/menu?q=burger')
    expect(menuHref(p, { view: 'list', page: '2' })).toBe(
      '/menu?q=burger&category=burgers&view=list&page=2',
    )
    expect(menuHref({})).toBe('/menu')
  })
  it('lists one removable chip per active filter', () => {
    const chips = activeFilterChips(
      { q: 'x', category: 'pizza', price: 'under-100', popular: '1', offers: '1' },
      (slug) => (slug === 'pizza' ? 'Pizza' : undefined),
    )
    expect(chips.map((c) => c.label)).toEqual(['“x”', 'Pizza', 'Under ₹100', 'Popular', 'On offer'])
    expect(chips[1].removeHref).toBe('/menu?q=x&price=under-100&popular=1&offers=1')
  })
})

describe('navigation gating (CLAUDE.md rule 7: no dead links)', () => {
  it('only shows pages that exist in this phase', () => {
    expect(liveNav().map((i) => i.href)).toEqual([
      '/',
      '/menu',
      '/offers',
      '/student-zone',
      '/gallery',
      '/contact',
    ])
    // Phase 6: every page exists now, including the secondary links.
    expect(isLive('/feedback')).toBe(true)
    expect(isLive('/qr')).toBe(true)
    expect(NAV_ITEMS).toHaveLength(6) // the full nav is defined once; phases switch pages on
  })
  it('marks the active section, exact for home', () => {
    expect(isActivePath('/menu/classic-veg-burger', '/menu')).toBe(true)
    expect(isActivePath('/menu', '/')).toBe(false)
    expect(isActivePath('/', '/')).toBe(true)
    expect(isActivePath('/menus', '/menu')).toBe(false)
  })
})

describe('time formatting (IST copy)', () => {
  it('formats 12-hour times', () => {
    expect(formatTime12(0)).toBe('12:00 AM')
    expect(formatTime12(630)).toBe('10:30 AM')
    expect(formatTime12(720)).toBe('12:00 PM')
    expect(formatTime12(1380)).toBe('11:00 PM')
    expect(formatTime12(1440)).toBe('12:00 AM')
  })
  it('formats a day range, or null when closed', () => {
    expect(
      formatHoursRange({ dayOfWeek: 1, opensAtMin: 660, closesAtMin: 1380, isClosed: false }),
    ).toBe('11:00 AM – 11:00 PM')
    expect(
      formatHoursRange({ dayOfWeek: 1, opensAtMin: 660, closesAtMin: 1380, isClosed: true }),
    ).toBeNull()
  })
})

describe('formatPhone', () => {
  it('groups Indian mobile numbers and leaves others unchanged', async () => {
    const { formatPhone } = await import('@/lib/format')
    expect(formatPhone('+919890011348')).toBe('+91 98900 11348')
    expect(formatPhone('0233-2600000')).toBe('0233-2600000')
  })
})

describe('offer % off (TC-UNIT-021)', () => {
  it('rounds down and hides zero or missing savings', async () => {
    const { percentOff } = await import('@/features/offers/offer-cards')
    expect(percentOff({ savingsPaise: 3800, regularPricePaise: 26700 })).toBe(14) // 14.23 → 14
    expect(percentOff({ savingsPaise: 2900, regularPricePaise: 15800 })).toBe(18) // 18.35 → 18
    expect(percentOff({ savingsPaise: null, regularPricePaise: 1000 })).toBeNull()
    expect(percentOff({ savingsPaise: 1, regularPricePaise: 1000 })).toBeNull() // 0.1% → hidden
  })
})

describe('page metadata (TC-UNIT-031, FR-021)', () => {
  it('builds canonical, Open Graph and Twitter fields with the default share image', () => {
    const m = pageMetadata({ title: 'Gallery', description: 'Photos.', path: '/gallery' })
    expect(m.title).toBe('Gallery')
    expect(m.alternates?.canonical).toBe('/gallery')
    expect(m.openGraph).toMatchObject({
      siteName: 'ZORKO Sangli',
      locale: 'en_IN',
      url: '/gallery',
      title: 'Gallery | ZORKO Sangli',
      images: [DEFAULT_OG_IMAGE],
    })
    expect(m.twitter).toMatchObject({ card: 'summary_large_image' })
  })
  it('uses the page image when there is one, and absolute titles as-is', () => {
    const m = pageMetadata({
      title: 'Home title',
      description: 'd',
      path: '/',
      absoluteTitle: true,
      image: { url: '/stock/pizza.webp', alt: 'Pizza' },
    })
    expect(m.title).toEqual({ absolute: 'Home title' })
    expect(m.openGraph).toMatchObject({
      title: 'Home title',
      images: [{ url: '/stock/pizza.webp' }],
    })
  })
})
