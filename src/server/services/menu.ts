import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { formatRupees } from '@/lib/format'
import { mediaUrl } from '@/lib/media'
import { PRICE_BANDS, type MenuQuery, type PriceBand } from '@/lib/validation/public'
import { getDb } from '../db'
import type { PageMeta } from '../http'
import { activeOfferWhere, publicItemWhere } from './visibility'

export type ImageDto = { url: string; altText: string }

export type MenuItemCardDto = {
  id: string
  slug: string
  name: string
  description: string
  pricePaise: number
  priceLabel: string
  dietType: string
  isAvailable: boolean
  isBestSeller: boolean
  isTrending: boolean
  isFeatured: boolean
  hasActiveOffer: boolean
  category: { slug: string; name: string }
  image: ImageDto | null
}

export type OfferSummaryDto = {
  slug: string
  kind: string
  title: string
  promoPricePaise: number | null
  priceLabel: string | null
  endsAt: string
}

export type MenuItemDetailDto = Omit<MenuItemCardDto, 'image'> & {
  images: ImageDto[]
  addOnGroups: {
    name: string
    minSelect: number
    maxSelect: number
    isRequired: boolean
    options: { name: string; priceDeltaPaise: number; priceLabel: string; isAvailable: boolean }[]
  }[]
  related: MenuItemCardDto[]
  frequentlyBoughtTogether: MenuItemCardDto[]
  combos: OfferSummaryDto[]
  activeDiscount: OfferSummaryDto | null
}

/** Explicit field list (DTO rule, TRD §6): internal flags never leave the server. */
export function cardSelect(now: Date) {
  return {
    id: true,
    slug: true,
    name: true,
    description: true,
    pricePaise: true,
    dietType: true,
    isAvailable: true,
    isBestSeller: true,
    isTrending: true,
    isFeatured: true,
    category: { select: { slug: true, name: true } },
    images: {
      orderBy: { sortOrder: 'asc' },
      take: 1,
      select: { storagePath: true, altText: true },
    },
    offers: { where: { offer: activeOfferWhere(now) }, take: 1, select: { offerId: true } },
  } satisfies Prisma.MenuItemSelect
}

export type CardRow = Prisma.MenuItemGetPayload<{ select: ReturnType<typeof cardSelect> }>

function toImage(row: { storagePath: string; altText: string } | undefined): ImageDto | null {
  const url = mediaUrl(row?.storagePath)
  return url && row ? { url, altText: row.altText } : null
}

export function toCard(row: CardRow): MenuItemCardDto {
  const { images, offers, ...rest } = row
  return {
    ...rest,
    priceLabel: formatRupees(row.pricePaise),
    hasActiveOffer: offers.length > 0,
    image: toImage(images[0]),
  }
}

const ORDER_BY: Record<MenuQuery['sort'], Prisma.MenuItemOrderByWithRelationInput[]> = {
  // Available items first, then admin flags. Never based on fabricated sales data.
  popular: [
    { isAvailable: 'desc' },
    { isBestSeller: 'desc' },
    { isTrending: 'desc' },
    { sortOrder: 'asc' },
    { name: 'asc' },
  ],
  price_asc: [{ pricePaise: 'asc' }, { name: 'asc' }],
  price_desc: [{ pricePaise: 'desc' }, { name: 'asc' }],
  name: [{ name: 'asc' }],
}

/** Escapes `\`, `%` and `_` so they match literally in ILIKE (Postgres default escape is `\`). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function priceBandWhere(band: PriceBand): Prisma.MenuItemWhereInput {
  const b = PRICE_BANDS[band]
  if ('maxPaiseExclusive' in b) return { pricePaise: { lt: b.maxPaiseExclusive } }
  if ('minPaiseExclusive' in b) return { pricePaise: { gt: b.minPaiseExclusive } }
  return { pricePaise: { gte: b.minPaise, lte: b.maxPaise } }
}

/** All filters combine with AND (FR menu: search + category + price + popular + offers). */
export function menuWhere(query: MenuQuery, now: Date): Prisma.MenuItemWhereInput {
  const and: Prisma.MenuItemWhereInput[] = [publicItemWhere]
  // Prisma parameterises the value, but `contains` does NOT escape LIKE wildcards: without this a
  // search for "%" or "_" would match everything (found in Phase 3 self-verification).
  if (query.q) and.push({ name: { contains: escapeLike(query.q), mode: 'insensitive' } })
  if (query.category) and.push({ category: { slug: query.category } })
  if (query.minPrice !== undefined) and.push({ pricePaise: { gte: query.minPrice * 100 } })
  if (query.maxPrice !== undefined) and.push({ pricePaise: { lte: query.maxPrice * 100 } })
  if (query.price) and.push(priceBandWhere(query.price))
  if (query.popular) and.push({ OR: [{ isBestSeller: true }, { isTrending: true }] })
  if (query.offers) and.push({ offers: { some: { offer: activeOfferWhere(now) } } })
  return { AND: and }
}

export async function listMenuItems(
  query: MenuQuery,
  now = new Date(),
): Promise<{ items: MenuItemCardDto[]; meta: PageMeta }> {
  const db = getDb()
  const where = menuWhere(query, now)
  // Two independent reads (no transaction: it would pin one pooled connection and the catalogue
  // changes rarely enough that a count/page mismatch for one request is harmless).
  const [total, rows] = await Promise.all([
    db.menuItem.count({ where }),
    db.menuItem.findMany({
      where,
      // `id` last keeps the order stable across pages when other keys tie.
      orderBy: [...ORDER_BY[query.sort], { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: cardSelect(now),
    }),
  ])
  return {
    items: rows.map(toCard),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  }
}

function toOfferSummary(o: {
  slug: string
  kind: string
  title: string
  promoPricePaise: number | null
  endsAt: Date
}): OfferSummaryDto {
  return {
    slug: o.slug,
    kind: o.kind,
    title: o.title,
    promoPricePaise: o.promoPricePaise,
    priceLabel: o.promoPricePaise === null ? null : formatRupees(o.promoPricePaise),
    endsAt: o.endsAt.toISOString(),
  }
}

/** Item details by slug, or null when the item does not exist or is not public. */
export async function getMenuItemBySlug(
  slug: string,
  now = new Date(),
): Promise<MenuItemDetailDto | null> {
  const card = cardSelect(now)
  const relationSelect = {
    where: { toItem: publicItemWhere },
    orderBy: { sortOrder: 'asc' },
    take: 16,
    select: { type: true, toItem: { select: card } },
  } satisfies Prisma.MenuItem$relationsFromArgs

  const row = await getDb().menuItem.findFirst({
    where: { AND: [publicItemWhere, { slug }] },
    select: {
      ...card,
      images: { orderBy: { sortOrder: 'asc' }, select: { storagePath: true, altText: true } },
      addOnGroups: {
        orderBy: { sortOrder: 'asc' },
        select: {
          name: true,
          minSelect: true,
          maxSelect: true,
          isRequired: true,
          options: {
            orderBy: { sortOrder: 'asc' },
            select: { name: true, priceDeltaPaise: true, isAvailable: true },
          },
        },
      },
      relationsFrom: relationSelect,
      offers: {
        where: { offer: activeOfferWhere(now) },
        select: {
          offer: {
            select: { slug: true, kind: true, title: true, promoPricePaise: true, endsAt: true },
          },
        },
      },
    },
  })
  if (!row) return null

  // One query returns both relation types; split them here (no N+1).
  const pick = (type: string) =>
    row.relationsFrom.filter((r) => r.type === type).map((r) => toCard(r.toItem))

  const offers = row.offers.map((o) => o.offer)
  const discount = offers.find((o) => o.kind === 'DISCOUNT')

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    pricePaise: row.pricePaise,
    priceLabel: formatRupees(row.pricePaise),
    dietType: row.dietType,
    isAvailable: row.isAvailable,
    isBestSeller: row.isBestSeller,
    isTrending: row.isTrending,
    isFeatured: row.isFeatured,
    hasActiveOffer: offers.length > 0,
    category: row.category,
    images: row.images.map((i) => toImage(i)).filter((i): i is ImageDto => i !== null),
    addOnGroups: row.addOnGroups.map((g) => ({
      ...g,
      options: g.options.map((o) => ({ ...o, priceLabel: `+${formatRupees(o.priceDeltaPaise)}` })),
    })),
    related: pick('RELATED'),
    frequentlyBoughtTogether: pick('FREQUENTLY_BOUGHT_TOGETHER'),
    combos: offers.filter((o) => o.kind === 'COMBO').map(toOfferSummary),
    activeDiscount: discount ? toOfferSummary(discount) : null,
  }
}
