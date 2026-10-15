import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { formatRupees, offerStatus } from '@/lib/format'
import { mediaUrl } from '@/lib/media'
import { slugify } from '@/lib/validation/admin-menu'
import type {
  BannerInput,
  CafeInput,
  GalleryInput,
  OfferInput,
} from '@/lib/validation/admin-content'
import { AdminRuleError } from '../admin-errors'
import { getDb } from '../db'

/**
 * Offers, banners, café information and gallery administration (Phase 5C, ADR-050). Callers
 * (Server Actions) must already have run `requireAdmin()` and validated the input.
 */

// ── Offers ───────────────────────────────────────────────────────────────────

export type AdminOfferStatus = 'draft' | 'scheduled' | 'active' | 'expired'

export function adminOfferStatus(
  o: { isPublished: boolean; startsAt: Date; endsAt: Date; expiredAt: Date | null },
  now = new Date(),
): AdminOfferStatus {
  const s = offerStatus(o, now)
  if (s === 'expired') return 'expired'
  return o.isPublished ? s : 'draft'
}

export async function listAdminOffers(now = new Date()) {
  const rows = await getDb().offer.findMany({
    orderBy: [{ endsAt: 'desc' }, { title: 'asc' }],
    take: 200,
    select: {
      id: true,
      slug: true,
      kind: true,
      title: true,
      promoPricePaise: true,
      startsAt: true,
      endsAt: true,
      expiredAt: true,
      isPublished: true,
      isStudentOffer: true,
      isFeatured: true,
      isDemo: true,
      _count: { select: { items: true } },
    },
  })
  return rows.map((o) => ({
    id: o.id,
    slug: o.slug,
    kind: o.kind,
    title: o.title,
    priceLabel: o.promoPricePaise === null ? null : formatRupees(o.promoPricePaise),
    startsAt: o.startsAt.toISOString(),
    endsAt: o.endsAt.toISOString(),
    status: adminOfferStatus(o, now),
    isStudentOffer: o.isStudentOffer,
    isFeatured: o.isFeatured,
    isDemo: o.isDemo,
    itemCount: o._count.items,
  }))
}

export async function getAdminOffer(id: string, now = new Date()) {
  const o = await getDb().offer.findUnique({
    where: { id },
    include: { items: { select: { menuItemId: true, quantity: true } } },
  })
  if (!o) return null
  return { ...o, status: adminOfferStatus(o, now), imageUrl: mediaUrl(o.imagePath) }
}
export type AdminOfferDetail = NonNullable<Awaited<ReturnType<typeof getAdminOffer>>>

/** Items an offer can include (archived items excluded; already linked ones stay listed). */
export async function listOfferItemOptions(includeIds: string[] = []) {
  return getDb().menuItem.findMany({
    where: { OR: [{ isArchived: false }, { id: { in: includeIds } }] },
    orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
    select: { id: true, name: true, pricePaise: true, category: { select: { name: true } } },
    take: 500,
  })
}

async function uniqueOfferSlug(tx: Prisma.TransactionClient, title: string) {
  const base = slugify(title)
  const taken = new Set(
    (
      await tx.offer.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })
    ).map((r) => r.slug),
  )
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

async function assertItems(tx: Prisma.TransactionClient, items: OfferInput['items']) {
  if (items.length === 0) return
  const found = await tx.menuItem.count({ where: { id: { in: items.map((i) => i.menuItemId) } } })
  if (found !== items.length)
    throw new AdminRuleError('One of the chosen menu items no longer exists.')
}

function offerData(input: OfferInput) {
  const { items, ...rest } = input
  void items
  return rest
}

export async function createOffer(input: OfferInput, imagePath: string | null) {
  return getDb().$transaction(async (tx) => {
    await assertItems(tx, input.items)
    const slug = await uniqueOfferSlug(tx, input.title)
    return tx.offer.create({
      data: {
        ...offerData(input),
        slug,
        imagePath,
        isDemo: false,
        items: { create: input.items },
      },
      select: { id: true, slug: true, title: true },
    })
  })
}

/**
 * Updates an offer and replaces its items. With a new image, returns the old image path for
 * cleanup. The slug never changes (shared links keep working).
 */
export async function updateOffer(id: string, input: OfferInput, newImagePath?: string | null) {
  return getDb().$transaction(async (tx) => {
    const existing = await tx.offer.findUnique({ where: { id }, select: { imagePath: true } })
    if (!existing) throw new AdminRuleError('This offer no longer exists.')
    await assertItems(tx, input.items)
    await tx.offerMenuItem.deleteMany({ where: { offerId: id } })
    const offer = await tx.offer.update({
      where: { id },
      data: {
        ...offerData(input),
        ...(newImagePath !== undefined ? { imagePath: newImagePath } : {}),
        items: { create: input.items },
      },
      select: { id: true, slug: true, title: true },
    })
    const oldImagePath =
      newImagePath !== undefined && existing.imagePath !== newImagePath ? existing.imagePath : null
    return { ...offer, oldImagePath }
  })
}

/** "Expire now" sets expiredAt (the public site hides it at once); "reactivate" clears it. */
export async function setOfferExpired(id: string, expired: boolean, now = new Date()) {
  const offer = await getDb().offer.findUnique({ where: { id }, select: { endsAt: true } })
  if (!offer) throw new AdminRuleError('This offer no longer exists.')
  if (!expired && offer.endsAt <= now)
    throw new AdminRuleError('Its end date has passed: change "Ends" to reactivate it.')
  return getDb().offer.update({
    where: { id },
    data: { expiredAt: expired ? now : null },
    select: { slug: true, title: true },
  })
}

export async function deleteOffer(id: string) {
  const offer = await getDb().offer.findUnique({
    where: { id },
    select: { slug: true, title: true, imagePath: true },
  })
  if (!offer) throw new AdminRuleError('This offer no longer exists.')
  await getDb().offer.delete({ where: { id } }) // OfferMenuItem rows cascade
  return offer
}

// ── Banners ──────────────────────────────────────────────────────────────────

export async function listAdminBanners() {
  const rows = await getDb().promotionalBanner.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    take: 100,
  })
  return rows.map((b) => ({
    id: b.id,
    title: b.title,
    imageUrl: mediaUrl(b.imagePath),
    altText: b.altText,
    ctaLabel: b.ctaLabel,
    ctaHref: b.ctaHref,
    startsAt: b.startsAt?.toISOString() ?? null,
    endsAt: b.endsAt?.toISOString() ?? null,
    isPublished: b.isPublished,
    sortOrder: b.sortOrder,
    isDemo: b.isDemo,
  }))
}

export async function getAdminBanner(id: string) {
  const b = await getDb().promotionalBanner.findUnique({ where: { id } })
  return b ? { ...b, imageUrl: mediaUrl(b.imagePath) } : null
}

export async function createBanner(input: BannerInput, imagePath: string) {
  return getDb().promotionalBanner.create({
    data: { ...input, imagePath, isDemo: false },
    select: { id: true, title: true },
  })
}

export async function updateBanner(id: string, input: BannerInput, newImagePath?: string) {
  const existing = await getDb().promotionalBanner.findUnique({
    where: { id },
    select: { imagePath: true },
  })
  if (!existing) throw new AdminRuleError('This banner no longer exists.')
  const banner = await getDb().promotionalBanner.update({
    where: { id },
    data: { ...input, ...(newImagePath ? { imagePath: newImagePath } : {}) },
    select: { id: true, title: true },
  })
  return { ...banner, oldImagePath: newImagePath ? existing.imagePath : null }
}

export async function deleteBanner(id: string) {
  const b = await getDb().promotionalBanner.findUnique({
    where: { id },
    select: { title: true, imagePath: true },
  })
  if (!b) throw new AdminRuleError('This banner no longer exists.')
  await getDb().promotionalBanner.delete({ where: { id } })
  return b
}

// ── Café information and hours ───────────────────────────────────────────────

export async function getAdminCafe() {
  const db = getDb()
  const [cafe, hours] = await Promise.all([
    db.cafeInformation.findUnique({ where: { id: 'cafe' } }),
    db.openingHours.findMany({ orderBy: { dayOfWeek: 'asc' } }),
  ])
  return {
    cafe: cafe
      ? {
          ...cafe,
          latitude: cafe.latitude === null ? null : Number(cafe.latitude),
          longitude: cafe.longitude === null ? null : Number(cafe.longitude),
        }
      : null,
    hours,
  }
}

/** Upserts the singleton row. Saving café info marks it as real (isDemo = false). */
export async function saveCafe(input: CafeInput) {
  await getDb().cafeInformation.upsert({
    where: { id: 'cafe' },
    create: { id: 'cafe', ...input, isDemo: false },
    update: { ...input, isDemo: false },
  })
}

/** Replaces all 7 days in one transaction. */
export async function saveHours(
  days: { dayOfWeek: number; isClosed: boolean; opensAtMin: number; closesAtMin: number }[],
) {
  if (days.length !== 7 || new Set(days.map((d) => d.dayOfWeek)).size !== 7)
    throw new AdminRuleError('All seven days are needed.')
  await getDb().$transaction(
    days.map((d) =>
      getDb().openingHours.upsert({
        where: { dayOfWeek: d.dayOfWeek },
        create: d,
        update: d,
      }),
    ),
  )
}

// ── Gallery ──────────────────────────────────────────────────────────────────

export const MAX_GALLERY_IMAGES = 200

export async function listAdminGallery() {
  const rows = await getDb().galleryImage.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    take: MAX_GALLERY_IMAGES,
  })
  return rows.map((g) => ({
    id: g.id,
    url: mediaUrl(g.storagePath),
    altText: g.altText,
    caption: g.caption,
    isPublished: g.isPublished,
    isDemo: g.isDemo,
  }))
}

export async function addGalleryImage(input: GalleryInput, storagePath: string) {
  const db = getDb()
  const count = await db.galleryImage.count()
  if (count >= MAX_GALLERY_IMAGES)
    throw new AdminRuleError(`The gallery can hold at most ${MAX_GALLERY_IMAGES} photos.`)
  const last = await db.galleryImage.aggregate({ _max: { sortOrder: true } })
  return db.galleryImage.create({
    data: { ...input, storagePath, sortOrder: (last._max.sortOrder ?? -1) + 1, isDemo: false },
    select: { id: true },
  })
}

export async function updateGalleryImage(id: string, input: GalleryInput) {
  const res = await getDb().galleryImage.updateMany({ where: { id }, data: input })
  if (res.count === 0) throw new AdminRuleError('This photo no longer exists.')
}

/** Swaps the photo with its neighbour in the display order. */
export async function moveGalleryImage(id: string, delta: -1 | 1) {
  await getDb().$transaction(async (tx) => {
    const rows = await tx.galleryImage.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    })
    const index = rows.findIndex((r) => r.id === id)
    if (index === -1) throw new AdminRuleError('This photo no longer exists.')
    const target = index + delta
    if (target < 0 || target >= rows.length) return
    const order = rows.map((r) => r.id)
    ;[order[index], order[target]] = [order[target]!, order[index]!]
    // Renumber 0…n-1 (gallery sortOrder has no unique constraint, so this is safe).
    for (const [i, rid] of order.entries())
      await tx.galleryImage.update({ where: { id: rid }, data: { sortOrder: i } })
  })
}

export async function deleteGalleryImage(id: string) {
  const g = await getDb().galleryImage.findUnique({ where: { id }, select: { storagePath: true } })
  if (!g) throw new AdminRuleError('This photo no longer exists.')
  await getDb().galleryImage.delete({ where: { id } })
  return g.storagePath
}
