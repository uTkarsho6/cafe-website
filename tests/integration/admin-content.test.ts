import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  bannerInputSchema,
  cafeInputSchema,
  galleryInputSchema,
  offerInputSchema,
  toIstInput,
} from '@/lib/validation/admin-content'
import * as admin from '@/server/services/admin-content'
import { getCafeInfo } from '@/server/services/cafe'
import { listActiveBanners, listPublishedGallery } from '@/server/services/home'
import { getOfferBySlug, listOffers } from '@/server/services/offers'
import { db } from './helpers'

// Uploaded paths only become URLs when a Storage origin is configured (src/lib/media.ts).
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example-test.supabase.co'

/** Phase 5C service layer against the throwaway test database (TC-INT-091). */
let itemId = ''
const offerIds: string[] = []
const day = 86_400_000

const offerInput = (patch: Record<string, unknown> = {}) =>
  offerInputSchema.parse({
    kind: 'COMBO',
    title: 'Test Combo 5C',
    description: 'Integration test combo for Phase 5C.',
    promoPrice: '199',
    startsAt: toIstInput(new Date(Date.now() - day)),
    endsAt: toIstInput(new Date(Date.now() + 7 * day)),
    isPublished: 'on',
    items: [{ menuItemId: itemId, quantity: 2 }],
    ...patch,
  })

beforeAll(async () => {
  const item = await db().menuItem.findFirstOrThrow({
    where: { isPublished: true, isArchived: false },
    orderBy: { slug: 'asc' },
  })
  itemId = item.id
})

afterAll(async () => {
  await db().offer.deleteMany({ where: { title: { startsWith: 'Test ' } } })
  await db().promotionalBanner.deleteMany({ where: { title: { startsWith: 'Test ' } } })
  await db().galleryImage.deleteMany({ where: { altText: { startsWith: 'Test ' } } })
})

describe('offers (TC-ADM-020…023)', () => {
  it('create → public while active; draft and scheduled handled; slug unique', async () => {
    const a = await admin.createOffer(offerInput(), null)
    const b = await admin.createOffer(offerInput(), null)
    offerIds.push(a.id, b.id)
    expect(a.slug).toBe('test-combo-5c')
    expect(b.slug).toBe('test-combo-5c-2')
    const pub = await getOfferBySlug(a.slug)
    expect(pub).toMatchObject({ status: 'active', priceLabel: '₹199' })
    expect(pub?.items).toEqual([expect.objectContaining({ quantity: 2 })])

    const draft = await admin.createOffer(
      offerInput({ title: 'Test Draft 5C', isPublished: undefined }),
      null,
    )
    expect(await getOfferBySlug(draft.slug)).toBeNull()
    expect((await admin.getAdminOffer(draft.id))?.status).toBe('draft')

    const later = await admin.createOffer(
      offerInput({
        title: 'Test Scheduled 5C',
        startsAt: toIstInput(new Date(Date.now() + 2 * day)),
        endsAt: toIstInput(new Date(Date.now() + 9 * day)),
      }),
      null,
    )
    expect((await getOfferBySlug(later.slug))?.status).toBe('scheduled')
  })

  it('update replaces items atomically and keeps the slug; unknown item → rollback', async () => {
    const o = await admin.createOffer(offerInput({ title: 'Test Update 5C' }), null)
    await admin.updateOffer(
      o.id,
      offerInput({
        title: 'Test Updated 5C',
        promoPrice: '249',
        items: [{ menuItemId: itemId, quantity: 1 }],
      }),
    )
    const row = await db().offer.findUniqueOrThrow({
      where: { id: o.id },
      include: { items: true },
    })
    expect(row).toMatchObject({
      slug: 'test-update-5c',
      title: 'Test Updated 5C',
      promoPricePaise: 24900,
    })
    expect(row.items.map((i) => i.quantity)).toEqual([1])
    await expect(
      admin.updateOffer(
        o.id,
        offerInput({ items: [{ menuItemId: 'cmf0000000000000000000000', quantity: 1 }] }),
      ),
    ).rejects.toThrow(/no longer exists/)
    const after = await db().offer.findUniqueOrThrow({
      where: { id: o.id },
      include: { items: true },
    })
    expect(after.items).toHaveLength(1) // unchanged
  })

  it('expire now hides it publicly at once; reactivate only while the end date is ahead', async () => {
    const o = await admin.createOffer(offerInput({ title: 'Test Expire 5C' }), null)
    await admin.setOfferExpired(o.id, true)
    expect(await getOfferBySlug(o.slug)).toBeNull()
    expect(
      Object.values(await listOffers({}))
        .flat()
        .map((x) => x.slug),
    ).not.toContain(o.slug)
    expect((await admin.getAdminOffer(o.id))?.status).toBe('expired')
    await admin.setOfferExpired(o.id, false)
    expect(await getOfferBySlug(o.slug)).not.toBeNull()
    await db().offer.update({
      where: { id: o.id },
      data: { endsAt: new Date(Date.now() - 1000), startsAt: new Date(Date.now() - day) },
    })
    await expect(admin.setOfferExpired(o.id, false)).rejects.toThrow(/end date has passed/)
  })

  it('delete removes the offer and its item links, never the menu item', async () => {
    const o = await admin.createOffer(
      offerInput({ title: 'Test Delete 5C' }),
      'offers/00000000-0000-4000-8000-000000000001.webp',
    )
    const deleted = await admin.deleteOffer(o.id)
    expect(deleted.imagePath).toMatch(/^offers\//)
    expect(await db().offerMenuItem.count({ where: { offerId: o.id } })).toBe(0)
    expect(await db().menuItem.findUnique({ where: { id: itemId } })).not.toBeNull()
  })
})

describe('banners (TC-ADM-024)', () => {
  const path = (n: number) => `banners/00000000-0000-4000-8000-00000000000${n}.webp`
  it('create → on the home page within its window; image replacement returns the old path', async () => {
    const input = bannerInputSchema.parse({
      title: 'Test Banner 5C',
      altText: 'Test banner image',
      ctaLabel: 'View offers',
      ctaHref: '/offers',
      isPublished: 'on',
    })
    const b = await admin.createBanner(input, path(1))
    const home = await listActiveBanners()
    expect(home.find((x) => x.id === b.id)).toMatchObject({ ctaHref: '/offers' })
    const upd = await admin.updateBanner(
      b.id,
      { ...input, endsAt: new Date(Date.now() - 1000), startsAt: new Date(Date.now() - day) },
      path(2),
    )
    expect(upd.oldImagePath).toBe(path(1))
    expect((await listActiveBanners()).find((x) => x.id === b.id)).toBeUndefined() // window ended
    expect((await admin.deleteBanner(b.id)).imagePath).toBe(path(2))
  })
})

describe('café information and hours (TC-ADM-030/031)', () => {
  it('saves café info (real data from now on) and seven days of hours, shown publicly', async () => {
    const before = await db().cafeInformation.findUnique({ where: { id: 'cafe' } })
    const beforeHours = await db().openingHours.findMany()
    await admin.saveCafe(
      cafeInputSchema.parse({
        name: 'ZORKO Sangli',
        addressLine: '100 Feet Rd, Vishrambag',
        city: 'Sangli',
        phone: '+91 98765 43210',
        instagramUrl: 'https://instagram.com/zorko.test',
        contactVerified: 'on',
      }),
    )
    const days = Array.from({ length: 7 }, (_, d) => ({
      dayOfWeek: d,
      isClosed: d === 1,
      opensAtMin: d === 1 ? 0 : 600,
      closesAtMin: d === 1 ? 0 : 1440,
    }))
    await admin.saveHours(days)
    const pub = await getCafeInfo()
    expect(pub).toMatchObject({
      phone: '+91 98765 43210',
      instagramUrl: 'https://instagram.com/zorko.test',
      isDemo: false,
    })
    expect(pub?.verified.contact).toBe(true)
    expect(pub?.hours[1]).toMatchObject({ isClosed: true })
    expect(pub?.hours[0]).toMatchObject({ opensAt: '10:00', closesAt: '24:00' })
    await expect(admin.saveHours(days.slice(0, 6))).rejects.toThrow(/seven days/)

    // Restore the seed values for the other suites.
    if (before) await db().cafeInformation.update({ where: { id: 'cafe' }, data: before })
    for (const h of beforeHours)
      await db().openingHours.update({
        where: { id: h.id },
        data: { isClosed: h.isClosed, opensAtMin: h.opensAtMin, closesAtMin: h.closesAtMin },
      })
  })
})

describe('gallery (TC-ADM-040)', () => {
  const path = (n: number) => `gallery/00000000-0000-4000-8000-00000000000${n}.webp`
  it('add, publish/unpublish, reorder and delete', async () => {
    const input = (alt: string, pub = true) =>
      galleryInputSchema.parse({ altText: alt, isPublished: pub ? 'on' : undefined })
    const a = await admin.addGalleryImage(input('Test photo A'), path(1))
    const b = await admin.addGalleryImage(input('Test photo B'), path(2))
    const c = await admin.addGalleryImage(input('Test photo C hidden', false), path(3))
    const visible = (await listPublishedGallery(60))
      .map((g) => g.altText)
      .filter((t) => t.startsWith('Test'))
    expect(visible).toEqual(['Test photo A', 'Test photo B'])
    await admin.moveGalleryImage(b.id, -1)
    const order = (await admin.listAdminGallery())
      .map((g) => g.altText)
      .filter((t) => t.startsWith('Test'))
    expect(order).toEqual(['Test photo B', 'Test photo A', 'Test photo C hidden'])
    await admin.updateGalleryImage(c.id, input('Test photo C', true))
    expect((await listPublishedGallery(60)).map((g) => g.altText)).toContain('Test photo C')
    expect(await admin.deleteGalleryImage(a.id)).toBe(path(1))
    await expect(admin.deleteGalleryImage(a.id)).rejects.toThrow(/no longer exists/)
  })
})
