import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { GET as getCategories } from '@/app/api/v1/categories/route'
import { GET as getMenu } from '@/app/api/v1/menu/route'
import { GET as getItem } from '@/app/api/v1/menu/[slug]/route'
import { GET as getOffers } from '@/app/api/v1/offers/route'
import { GET as getOffer } from '@/app/api/v1/offers/[slug]/route'
import { GET as getCafe } from '@/app/api/v1/cafe/route'
import { GET as getHealth } from '@/app/api/health/route'
import { toApiError } from '@/server/http'
import { demoCafe } from '../../prisma/fixtures/test-data'
import { call, db, params } from './helpers'

// ------------------------------------------------------------------ response contracts (TRD §6)
const image = z.object({ url: z.string(), altText: z.string() }).strict()
const card = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    pricePaise: z.number().int().positive(),
    priceLabel: z.string().regex(/^₹[\d,]+(\.\d{2})?$/),
    dietType: z.enum(['VEG', 'NON_VEG', 'EGG']),
    isAvailable: z.boolean(),
    isBestSeller: z.boolean(),
    isTrending: z.boolean(),
    isFeatured: z.boolean(),
    hasActiveOffer: z.boolean(),
    category: z.object({ slug: z.string(), name: z.string() }).strict(),
    image: image.nullable(),
  })
  .strict() // .strict(): an extra (possibly internal) field fails the contract
const meta = z
  .object({ page: z.number(), pageSize: z.number(), total: z.number(), totalPages: z.number() })
  .strict()
const offerSummary = z
  .object({
    slug: z.string(),
    kind: z.string(),
    title: z.string(),
    promoPricePaise: z.number().nullable(),
    priceLabel: z.string().nullable(),
    endsAt: z.iso.datetime(),
  })
  .strict()
const detail = card
  .omit({ image: true })
  .extend({
    images: z.array(image),
    addOnGroups: z.array(
      z
        .object({
          name: z.string(),
          minSelect: z.number(),
          maxSelect: z.number(),
          isRequired: z.boolean(),
          options: z.array(
            z
              .object({
                name: z.string(),
                priceDeltaPaise: z.number(),
                priceLabel: z.string(),
                isAvailable: z.boolean(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    flavours: z.array(z.string()),
    related: z.array(card),
    frequentlyBoughtTogether: z.array(card),
    combos: z.array(offerSummary),
    activeDiscount: offerSummary.nullable(),
  })
  .strict()
const offer = z
  .object({
    slug: z.string(),
    kind: z.enum(['DISCOUNT', 'COMBO', 'INFO']),
    status: z.enum(['active', 'scheduled']),
    title: z.string(),
    description: z.string(),
    image: image.nullable(),
    promoPricePaise: z.number().nullable(),
    priceLabel: z.string().nullable(),
    regularPricePaise: z.number().nullable(),
    regularPriceLabel: z.string().nullable(),
    savingsPaise: z.number().nullable(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    isStudentOffer: z.boolean(),
    isFeatured: z.boolean(),
    items: z.array(
      z
        .object({
          slug: z.string(),
          name: z.string(),
          quantity: z.number(),
          isAvailable: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict()
const errorBody = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        fields: z.record(z.string(), z.string()).optional(),
      })
      .strict(),
  })
  .strict()

const menu = (qs = '') => call(getMenu, `/api/v1/menu${qs}`)
const slugs = (body: { data: { slug: string }[] }) => body.data.map((i) => i.slug)

describe('response contracts (TC-INT-050)', () => {
  it('menu list', async () => {
    const res = await menu()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    z.object({ data: z.array(card), meta })
      .strict()
      .parse(res.body)
  })
  it('categories', async () => {
    const res = await call(getCategories, '/api/v1/categories')
    z.object({
      data: z.array(
        z
          .object({
            id: z.string(),
            slug: z.string(),
            name: z.string(),
            description: z.string().nullable(),
            iconKey: z.string(),
            itemCount: z.number().int().nonnegative(),
          })
          .strict(),
      ),
    })
      .strict()
      .parse(res.body)
  })
  it('item detail', async () => {
    const res = await call(getItem, '/x', params({ slug: 'classic-veg-burger' }))
    z.object({ data: detail }).strict().parse(res.body)
  })
  it('offers list and detail', async () => {
    const list = await call(getOffers, '/api/v1/offers')
    z.object({ data: z.object({ active: z.array(offer), scheduled: z.array(offer) }).strict() })
      .strict()
      .parse(list.body)
    const one = await call(getOffer, '/x', params({ slug: 'burger-fries-combo' }))
    z.object({ data: offer }).strict().parse(one.body)
  })
  it('café', async () => {
    const res = await call(getCafe, '/api/v1/cafe')
    expect(res.status).toBe(200)
    expect(res.body.data.hours).toHaveLength(7)
    expect(res.body.data.verified).toEqual({
      address: false,
      contact: false,
      hours: false,
      map: false,
      social: false,
    })
    expect(typeof res.body.data.openNow).toBe('boolean')
    expect(Object.keys(res.body.data)).not.toContain('id')
  })
  it('errors use the standard shape and never leak internals', async () => {
    for (const res of [
      await menu('?pageSize=999'),
      await call(getItem, '/x', params({ slug: 'does-not-exist' })),
      await call(getOffer, '/x', params({ slug: 'NOT A SLUG' })),
    ]) {
      errorBody.parse(res.body)
      expect(JSON.stringify(res.body)).not.toMatch(/prisma|postgres|stack|select |at \//i)
      expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    }
  })
})

describe('menu filters (TC-INT-010, TC-UNIT-012 boundaries)', () => {
  it('combines search + category + price range (all must match)', async () => {
    const res = await menu('?q=burger&category=burgers&minPrice=100&maxPrice=150')
    expect(slugs(res.body)).toEqual(['paneer-tikka-burger'])
    expect(res.body.meta.total).toBe(1)
  })
  it('search is case-insensitive and matches part of the name', async () => {
    expect(slugs((await menu('?q=PIZZA&sort=name')).body)).toEqual([
      'farmhouse-pizza',
      'margherita-pizza',
      'tandoori-paneer-pizza',
    ])
  })
  it('price bounds are inclusive and in whole rupees', async () => {
    const at99 = await menu('?minPrice=99&maxPrice=99&sort=name')
    expect(at99.body.data.every((i: { pricePaise: number }) => i.pricePaise === 9900)).toBe(true)
    expect(slugs(at99.body)).toEqual(['chocolate-brownie', 'classic-veg-burger', 'peri-peri-fries'])
    const under100 = await menu('?maxPrice=99&pageSize=48')
    expect(under100.body.data.every((i: { pricePaise: number }) => i.pricePaise <= 9900)).toBe(true)
    const over200 = await menu('?minPrice=200&pageSize=48')
    expect(over200.body.data.every((i: { pricePaise: number }) => i.pricePaise >= 20000)).toBe(true)
  })
  it('price bands filter in paise: under-100 < ₹100, 100-200 inclusive, 200-plus > ₹200', async () => {
    const prices = async (band: string) =>
      (await menu(`?price=${band}&pageSize=48`)).body.data.map(
        (i: { pricePaise: number }) => i.pricePaise,
      )
    expect((await prices('under-100')).every((p: number) => p < 10000)).toBe(true)
    const mid = await prices('100-200')
    expect(mid.every((p: number) => p >= 10000 && p <= 20000)).toBe(true)
    expect(mid).toContain(19900)
    expect((await prices('200-plus')).every((p: number) => p > 20000)).toBe(true)
    expect((await menu('?price=cheap')).status).toBe(400)
  })
  it('popular = best seller OR trending; offers = in an ACTIVE offer only', async () => {
    const popular = await menu('?popular=1&pageSize=48')
    expect(
      popular.body.data.every(
        (i: { isBestSeller: boolean; isTrending: boolean }) => i.isBestSeller || i.isTrending,
      ),
    ).toBe(true)
    const offers = await menu('?offers=1&pageSize=48')
    expect(new Set(slugs(offers.body))).toEqual(
      new Set([
        'classic-veg-burger',
        'french-fries',
        'cold-coffee',
        'margherita-pizza',
        'peri-peri-fries',
        'masala-lemonade',
      ]),
    ) // not brownie-with-ice-cream (scheduled) nor white-sauce-pasta (expired)
    expect(offers.body.data.every((i: { hasActiveOffer: boolean }) => i.hasActiveOffer)).toBe(true)
  })
  it('sorts by price both ways and lists unavailable items last in the default sort', async () => {
    const asc = (await menu('?sort=price_asc&pageSize=48')).body.data.map(
      (i: { pricePaise: number }) => i.pricePaise,
    )
    expect(asc).toEqual([...asc].sort((a, b) => a - b))
    const desc = (await menu('?sort=price_desc&pageSize=48')).body.data.map(
      (i: { pricePaise: number }) => i.pricePaise,
    )
    expect(desc).toEqual([...desc].sort((a, b) => b - a))
    const popular = (await menu('?pageSize=48')).body.data as { isAvailable: boolean }[]
    const firstUnavailable = popular.findIndex((i) => !i.isAvailable)
    expect(popular.slice(firstUnavailable).every((i) => !i.isAvailable)).toBe(true)
  })
  it('returns an empty page (not an error) when nothing matches', async () => {
    const res = await menu('?q=zzzz-no-such-item')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ data: [], meta: { page: 1, pageSize: 12, total: 0, totalPages: 0 } })
  })
})

describe('pagination (TC-INT-011, TC-INT-013)', () => {
  it('pages cover every public item exactly once in a stable order', async () => {
    const all = (await menu('?pageSize=48')).body
    const seen: string[] = []
    for (let page = 1; page <= Math.ceil(all.meta.total / 5); page++) {
      const res = await menu(`?pageSize=5&page=${page}`)
      expect(res.body.meta).toMatchObject({ page, pageSize: 5, total: all.meta.total })
      seen.push(...slugs(res.body))
    }
    expect(seen).toEqual(slugs(all))
    expect(new Set(seen).size).toBe(seen.length)
  })
  it('an out-of-range page is empty with correct meta', async () => {
    const res = await menu('?page=99')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
    expect(res.body.meta.page).toBe(99)
  })
  it('rejects pageSize above the cap with 400 and field details', async () => {
    const res = await menu('?pageSize=49')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { pageSize: expect.any(String) },
    })
  })
})

describe('public visibility (TC-INT-012, TC-INT-020, TC-INT-021)', () => {
  afterEach(async () => {
    await db().menuCategory.update({ where: { slug: 'snacks' }, data: { isArchived: false } })
    await db().menuItem.update({ where: { slug: 'farmhouse-pizza' }, data: { isArchived: false } })
  })

  it('never returns unpublished items, in lists or by slug', async () => {
    expect(slugs((await menu('?pageSize=48')).body)).not.toContain('pink-sauce-pasta')
    expect((await call(getItem, '/x', params({ slug: 'pink-sauce-pasta' }))).status).toBe(404)
  })
  it('hides archived items and every item of an archived category', async () => {
    await db().menuItem.update({ where: { slug: 'farmhouse-pizza' }, data: { isArchived: true } })
    await db().menuCategory.update({ where: { slug: 'snacks' }, data: { isArchived: true } })
    const list = slugs((await menu('?pageSize=48')).body)
    expect(list).not.toContain('farmhouse-pizza')
    expect(list).not.toContain('french-fries')
    expect((await call(getItem, '/x', params({ slug: 'farmhouse-pizza' }))).status).toBe(404)
    expect((await call(getItem, '/x', params({ slug: 'french-fries' }))).status).toBe(404)
    const cats = (await call(getCategories, '/api/v1/categories')).body.data
    expect(cats.map((c: { slug: string }) => c.slug)).not.toContain('snacks')
    expect(cats.find((c: { slug: string }) => c.slug === 'pizza').itemCount).toBe(2)
  })
  it('shows unavailable items labelled as unavailable', async () => {
    const item = await call(getItem, '/x', params({ slug: 'double-cheese-burger' }))
    expect(item.status).toBe(200)
    expect(item.body.data.isAvailable).toBe(false)
  })
  it('item details include only public related items and active offers', async () => {
    const pasta = (await call(getItem, '/x', params({ slug: 'white-sauce-pasta' }))).body.data
    expect(slugs({ data: pasta.related })).toEqual(['red-sauce-pasta']) // unpublished one hidden
    expect(pasta.activeDiscount).toBeNull() // its only discount has expired
    const pizza = (await call(getItem, '/x', params({ slug: 'margherita-pizza' }))).body.data
    expect(pizza.activeDiscount?.slug).toBe('pizza-duo-deal')
    expect(pizza.addOnGroups.map((g: { name: string }) => g.name)).toEqual(['Crust', 'Toppings'])
    const burger = (await call(getItem, '/x', params({ slug: 'classic-veg-burger' }))).body.data
    expect(slugs({ data: burger.frequentlyBoughtTogether })).toEqual([
      'french-fries',
      'cold-coffee',
    ])
    expect(burger.combos.map((c: { slug: string }) => c.slug)).toEqual(['burger-fries-combo'])
  })
})

describe('offers (TC-INT-030)', () => {
  it('lists active and scheduled offers and never expired or unpublished ones', async () => {
    const { active, scheduled } = (await call(getOffers, '/api/v1/offers')).body.data
    const all = [...active, ...scheduled].map((o: { slug: string }) => o.slug)
    expect(all).not.toContain('old-pasta-offer')
    expect(all).not.toContain('draft-offer')
    expect(scheduled.map((o: { slug: string }) => o.slug)).toEqual(['weekend-dessert-special'])
    expect(active[0].slug).toBe('burger-fries-combo') // featured first
  })
  it('computes the regular price and savings of a combo from its items', async () => {
    const combo = (await call(getOffer, '/x', params({ slug: 'burger-fries-combo' }))).body.data
    expect(combo).toMatchObject({
      promoPricePaise: 22900,
      regularPricePaise: 26700,
      savingsPaise: 3800,
    })
  })
  it('filters by kind and Student Zone', async () => {
    const res = await call(getOffers, '/api/v1/offers?student=1&kind=combo')
    expect(res.body.data.active.map((o: { slug: string }) => o.slug)).toEqual(['student-snack-box'])
  })
  it('returns 404 for expired, unpublished and early-expired offers', async () => {
    for (const slug of ['old-pasta-offer', 'draft-offer', 'no-such-offer']) {
      expect((await call(getOffer, '/x', params({ slug }))).status).toBe(404)
    }
    await db().offer.update({ where: { slug: 'pizza-duo-deal' }, data: { expiredAt: new Date() } })
    try {
      expect((await call(getOffer, '/x', params({ slug: 'pizza-duo-deal' }))).status).toBe(404)
      expect(slugs((await menu('?offers=1&pageSize=48')).body)).not.toContain('margherita-pizza')
    } finally {
      await db().offer.update({ where: { slug: 'pizza-duo-deal' }, data: { expiredAt: null } })
    }
  })
})

describe('café map and directions (TC-INT-042, ADR-046)', () => {
  const reset = () =>
    db().cafeInformation.update({
      where: { id: 'cafe' },
      data: {
        addressVerified: false,
        addressLine: demoCafe.addressLine,
        latitude: null,
        longitude: null,
        postalCode: null,
        mapsQuery: null,
      },
    })
  afterEach(reset)
  const cafe = async () => (await call(getCafe, '/api/v1/cafe')).body.data

  it('an unverified placeholder address is never sent to Google', async () => {
    expect(await cafe()).toMatchObject({ mapQuery: null, directionsUrl: null })
  })
  it('a verified address gives an address-based map and an encoded directions link', async () => {
    await db().cafeInformation.update({
      where: { id: 'cafe' },
      data: {
        addressVerified: true,
        addressLine: 'Chavan Arkade & Co, 100 ft. Road',
        postalCode: '416415',
      },
    })
    const data = await cafe()
    expect(data.mapQuery).toBe('ZORKO Sangli, Chavan Arkade & Co, 100 ft. Road, Sangli, 416415')
    expect(data.directionsUrl).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(data.mapQuery)}`,
    )
    expect(data.directionsUrl).not.toContain('&Co') // "&" is encoded, so it can't add URL params
  })
  it('the Google Maps place wins over coordinates, so directions open the business', async () => {
    await db().cafeInformation.update({
      where: { id: 'cafe' },
      data: { latitude: 16.85, longitude: 74.58, mapsQuery: '  Cafe Zorko, 100 Feet Rd, Sangli  ' },
    })
    expect(await cafe()).toMatchObject({
      mapQuery: 'Cafe Zorko, 100 Feet Rd, Sangli',
      directionsUrl:
        'https://www.google.com/maps/dir/?api=1&destination=Cafe%20Zorko%2C%20100%20Feet%20Rd%2C%20Sangli',
    })
  })
  it('coordinates win over the address', async () => {
    await db().cafeInformation.update({
      where: { id: 'cafe' },
      data: { addressVerified: true, latitude: 16.85, longitude: 74.58 },
    })
    expect(await cafe()).toMatchObject({
      mapQuery: '16.85,74.58',
      directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=16.85%2C74.58',
    })
  })
})

describe('injection attempts (TC-SEC-090)', () => {
  const payloads = [
    "' OR 1=1 --",
    '\'; DROP TABLE "MenuItem"; --',
    '" OR ""="',
    '%',
    '_',
    '\\',
    'burger\' UNION SELECT * FROM "AdminUser" --',
    '<script>alert(1)</script>',
    '${7*7}',
    '{"$ne": null}',
  ]
  it.each(payloads)('search %j is treated as plain text', async (payload) => {
    const res = await menu(`?q=${encodeURIComponent(payload)}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })
  it.each(payloads)(
    'slug %j is rejected with 400 before reaching the database',
    async (payload) => {
      expect((await call(getItem, '/x', params({ slug: payload }))).status).toBe(400)
      expect((await call(getOffer, '/x', params({ slug: payload }))).status).toBe(400)
    },
  )
  it.each(["burgers' OR '1'='1", '../admin', 'burgers;--'])(
    'category %j is rejected with 400',
    async (payload) => {
      expect((await menu(`?category=${encodeURIComponent(payload)}`)).status).toBe(400)
    },
  )
  it('the tables are intact afterwards', async () => {
    expect(await db().menuItem.count()).toBeGreaterThan(0)
  })
})

describe('health and database failures (TC-INT-080)', () => {
  it('reports db ok when the database answers', async () => {
    const res = await call(getHealth, '/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' })
  })
  it('maps an unreachable database to 503 without connection details', async () => {
    const broken = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: 'postgresql://zorko_test:zorko_test@127.0.0.1:1/nowhere',
        connectionTimeoutMillis: 2000,
      }),
    })
    const err = await broken.menuItem.findMany().catch((e: unknown) => e)
    await broken.$disconnect()
    const mapped = toApiError(err)
    expect(mapped.status).toBe(503)
    expect(mapped.message).not.toMatch(/127\.0\.0\.1|zorko_test|ECONNREFUSED/)
  })
})
