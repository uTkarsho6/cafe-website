import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { formatRupees } from '@/lib/format'
import { mediaUrl } from '@/lib/media'
import {
  slugify,
  type AddOnGroupsInput,
  type AdminItemQuery,
  type CategoryInput,
  type ItemInput,
  type RelationsInput,
} from '@/lib/validation/admin-menu'
import { AdminRuleError } from '../admin-errors'
import { getDb } from '../db'

/**
 * Menu administration data layer (Phase 5B, TRD §6.3). Callers (Server Actions) must already have
 * run `requireAdmin()` and validated input with the schemas in `lib/validation/admin-menu`.
 * Functions take only those typed inputs, so no request field can reach Prisma unfiltered.
 */

export { AdminRuleError }

export const ADMIN_PAGE_SIZE = 20
const MAX_IMAGES_PER_ITEM = 4 // matches the MenuItemImage_sort_range CHECK (0–3)

// ── Lists and lookups ────────────────────────────────────────────────────────

export type AdminItemRow = {
  id: string
  slug: string
  name: string
  priceLabel: string
  categoryName: string
  isAvailable: boolean
  isPublished: boolean
  isArchived: boolean
  isBestSeller: boolean
  isTrending: boolean
  isFeatured: boolean
  isDemo: boolean
  updatedAt: string
}

export async function listAdminItems(query: AdminItemQuery) {
  const where: Prisma.MenuItemWhereInput = {
    ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    ...(query.category ? { categoryId: query.category } : {}),
    ...(query.status === 'archived' ? { isArchived: true } : { isArchived: false }),
    ...(query.status === 'available' ? { isAvailable: true } : {}),
    ...(query.status === 'unavailable' ? { isAvailable: false } : {}),
    ...(query.status === 'hidden' ? { isPublished: false } : {}),
  }
  const db = getDb()
  const [total, rows] = await Promise.all([
    db.menuItem.count({ where }),
    db.menuItem.findMany({
      where,
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
      skip: (query.page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        name: true,
        pricePaise: true,
        isAvailable: true,
        isPublished: true,
        isArchived: true,
        isBestSeller: true,
        isTrending: true,
        isFeatured: true,
        isDemo: true,
        updatedAt: true,
        category: { select: { name: true } },
      },
    }),
  ])
  const items: AdminItemRow[] = rows.map(({ pricePaise, category, updatedAt, ...r }) => ({
    ...r,
    priceLabel: formatRupees(pricePaise),
    categoryName: category.name,
    updatedAt: updatedAt.toISOString(),
  }))
  return { items, total, totalPages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) }
}

export async function getAdminItem(id: string) {
  const item = await getDb().menuItem.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, isArchived: true } },
      images: { orderBy: { sortOrder: 'asc' } },
      addOnGroups: {
        orderBy: { sortOrder: 'asc' },
        include: { options: { orderBy: { sortOrder: 'asc' } } },
      },
      relationsFrom: { orderBy: { sortOrder: 'asc' }, select: { toItemId: true, type: true } },
      _count: { select: { offers: true } },
    },
  })
  if (!item) return null
  return {
    ...item,
    images: item.images.map((img) => ({ ...img, url: mediaUrl(img.storagePath) })),
    related: item.relationsFrom.filter((r) => r.type === 'RELATED').map((r) => r.toItemId),
    together: item.relationsFrom
      .filter((r) => r.type === 'FREQUENTLY_BOUGHT_TOGETHER')
      .map((r) => r.toItemId),
    offerCount: item._count.offers,
  }
}
export type AdminItemDetail = NonNullable<Awaited<ReturnType<typeof getAdminItem>>>

/** Options for the category dropdown (archived categories are marked, still selectable). */
export async function listCategoryOptions() {
  return getDb().menuCategory.findMany({
    orderBy: [{ isArchived: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, isArchived: true },
  })
}

/** Items that can be linked as related / bought-together (not archived, not the item itself). */
export async function listRelationOptions(excludeId: string) {
  return getDb().menuItem.findMany({
    where: { isArchived: false, id: { not: excludeId } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
    take: 500,
  })
}

// ── Items ────────────────────────────────────────────────────────────────────

async function assertCategory(tx: Prisma.TransactionClient, categoryId: string) {
  const cat = await tx.menuCategory.findUnique({ where: { id: categoryId }, select: { id: true } })
  if (!cat) throw new AdminRuleError('The chosen category no longer exists.')
}

/** A unique slug: "masala-fries", then "masala-fries-2", … */
async function uniqueSlug(
  tx: Prisma.TransactionClient,
  table: 'menuItem' | 'menuCategory',
  name: string,
): Promise<string> {
  const base = slugify(name)
  const where = { slug: { startsWith: base } }
  const select = { slug: true } as const
  const rows =
    table === 'menuItem'
      ? await tx.menuItem.findMany({ where, select })
      : await tx.menuCategory.findMany({ where, select })
  const taken = new Set(rows.map((r) => r.slug))
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

function itemData(input: ItemInput) {
  const { price, ...rest } = input
  return { ...rest, pricePaise: price }
}

export async function createItem(input: ItemInput) {
  return getDb().$transaction(async (tx) => {
    await assertCategory(tx, input.categoryId)
    const slug = await uniqueSlug(tx, 'menuItem', input.name)
    return tx.menuItem.create({
      data: { ...itemData(input), slug, isDemo: false },
      select: { id: true, slug: true, name: true },
    })
  })
}

/** The slug stays the same on rename, so shared links and QR codes keep working. */
export async function updateItem(id: string, input: ItemInput) {
  return getDb().$transaction(async (tx) => {
    await assertCategory(tx, input.categoryId)
    const existing = await tx.menuItem.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw new AdminRuleError('This item no longer exists.')
    return tx.menuItem.update({
      where: { id },
      data: itemData(input),
      select: { id: true, slug: true, name: true, pricePaise: true, isAvailable: true },
    })
  })
}

export async function setItemAvailability(id: string, isAvailable: boolean) {
  const res = await getDb().menuItem.updateMany({ where: { id }, data: { isAvailable } })
  if (res.count === 0) throw new AdminRuleError('This item no longer exists.')
  return getDb().menuItem.findUniqueOrThrow({ where: { id }, select: { slug: true, name: true } })
}

export async function setItemArchived(id: string, isArchived: boolean) {
  const res = await getDb().menuItem.updateMany({ where: { id }, data: { isArchived } })
  if (res.count === 0) throw new AdminRuleError('This item no longer exists.')
  return getDb().menuItem.findUniqueOrThrow({ where: { id }, select: { slug: true, name: true } })
}

/**
 * Hard delete (A-03): only an archived item that no offer or combo uses. Images, add-ons and
 * relations cascade. Returns the Storage paths so the caller can remove the files.
 */
export async function deleteItem(id: string) {
  return getDb().$transaction(async (tx) => {
    const item = await tx.menuItem.findUnique({
      where: { id },
      select: {
        slug: true,
        name: true,
        isArchived: true,
        images: { select: { storagePath: true } },
        _count: { select: { offers: true } },
      },
    })
    if (!item) throw new AdminRuleError('This item no longer exists.')
    if (!item.isArchived) throw new AdminRuleError('Archive the item before deleting it.')
    if (item._count.offers > 0)
      throw new AdminRuleError(
        'This item is part of an offer or combo, so it can only be archived.',
      )
    await tx.menuItem.delete({ where: { id } })
    return { slug: item.slug, name: item.name, paths: item.images.map((i) => i.storagePath) }
  })
}

/** Replaces all add-on groups of an item in one transaction (all or nothing). */
export async function replaceAddOns(itemId: string, groups: AddOnGroupsInput) {
  return getDb().$transaction(async (tx) => {
    const item = await tx.menuItem.findUnique({
      where: { id: itemId },
      select: { slug: true, name: true },
    })
    if (!item) throw new AdminRuleError('This item no longer exists.')
    await tx.addOnGroup.deleteMany({ where: { menuItemId: itemId } })
    for (const [gi, g] of groups.entries()) {
      await tx.addOnGroup.create({
        data: {
          menuItemId: itemId,
          name: g.name,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          isRequired: g.minSelect > 0,
          sortOrder: gi,
          options: {
            create: g.options.map((o, oi) => ({
              name: o.name,
              priceDeltaPaise: o.price,
              isAvailable: o.isAvailable,
              sortOrder: oi,
            })),
          },
        },
      })
    }
    return item
  })
}

/** Replaces related / bought-together links. Targets must exist, be unarchived and not self. */
export async function replaceRelations(itemId: string, input: RelationsInput) {
  const related = [...new Set(input.related)]
  const together = [...new Set(input.together)]
  if (related.includes(itemId) || together.includes(itemId))
    throw new AdminRuleError('An item cannot be linked to itself.')
  return getDb().$transaction(async (tx) => {
    const item = await tx.menuItem.findUnique({
      where: { id: itemId },
      select: { slug: true, name: true },
    })
    if (!item) throw new AdminRuleError('This item no longer exists.')
    const ids = [...new Set([...related, ...together])]
    const found = await tx.menuItem.count({ where: { id: { in: ids }, isArchived: false } })
    if (found !== ids.length) throw new AdminRuleError('One of the chosen items no longer exists.')
    await tx.itemRelation.deleteMany({ where: { fromItemId: itemId } })
    await tx.itemRelation.createMany({
      data: [
        ...related.map((toItemId, i) => ({
          fromItemId: itemId,
          toItemId,
          type: 'RELATED' as const,
          sortOrder: i,
        })),
        ...together.map((toItemId, i) => ({
          fromItemId: itemId,
          toItemId,
          type: 'FREQUENTLY_BOUGHT_TOGETHER' as const,
          sortOrder: i,
        })),
      ],
    })
    // Slugs of linked items: their pages show nothing new, but the item's own page does.
    return item
  })
}

// ── Images ───────────────────────────────────────────────────────────────────

/**
 * Adds an image row after the file is in Storage. With `replaceImageId`, the new image takes the
 * old one's position and the old row is removed; the old Storage path is returned for cleanup.
 */
export async function addItemImage(
  itemId: string,
  storagePath: string,
  altText: string,
  replaceImageId?: string,
) {
  return getDb().$transaction(async (tx) => {
    const item = await tx.menuItem.findUnique({
      where: { id: itemId },
      select: {
        slug: true,
        name: true,
        images: { select: { id: true, sortOrder: true, storagePath: true } },
      },
    })
    if (!item) throw new AdminRuleError('This item no longer exists.')
    // Lowest free position: after removals, positions can have gaps (e.g. 0 and 3 in use).
    const used = new Set(item.images.map((i) => i.sortOrder))
    let sortOrder = [...Array(MAX_IMAGES_PER_ITEM).keys()].find((n) => !used.has(n)) ?? -1
    let oldPath: string | null = null
    if (replaceImageId) {
      const old = item.images.find((i) => i.id === replaceImageId)
      if (!old) throw new AdminRuleError('The image to replace no longer exists.')
      await tx.menuItemImage.delete({ where: { id: old.id } })
      sortOrder = old.sortOrder
      oldPath = old.storagePath
    } else if (item.images.length >= MAX_IMAGES_PER_ITEM) {
      throw new AdminRuleError(`An item can have at most ${MAX_IMAGES_PER_ITEM} images.`)
    }
    await tx.menuItemImage.create({ data: { menuItemId: itemId, storagePath, altText, sortOrder } })
    return { slug: item.slug, name: item.name, oldPath }
  })
}

export async function updateItemImageAlt(itemId: string, imageId: string, altText: string) {
  const res = await getDb().menuItemImage.updateMany({
    where: { id: imageId, menuItemId: itemId },
    data: { altText },
  })
  if (res.count === 0) throw new AdminRuleError('This image no longer exists.')
}

/**
 * Moves an image one place earlier (-1) or later (+1); the first image is the main photo.
 * Swaps positions with the neighbour. The (item, position) pair is unique and positions are
 * limited to 0–3, so the two rows are re-inserted with swapped positions in one transaction.
 */
export async function moveItemImage(itemId: string, imageId: string, delta: -1 | 1) {
  return getDb().$transaction(async (tx) => {
    const images = await tx.menuItemImage.findMany({
      where: { menuItemId: itemId },
      orderBy: { sortOrder: 'asc' },
    })
    const index = images.findIndex((i) => i.id === imageId)
    if (index === -1) throw new AdminRuleError('This image no longer exists.')
    const other = images[index + delta]
    if (!other) return // already first / last
    const current = images[index]!
    await tx.menuItemImage.deleteMany({ where: { id: { in: [current.id, other.id] } } })
    await tx.menuItemImage.createMany({
      data: [
        { ...current, sortOrder: other.sortOrder },
        { ...other, sortOrder: current.sortOrder },
      ],
    })
  })
}

/** Removes an image row (scoped to the item, so one item's form cannot delete another's image). */
export async function removeItemImage(itemId: string, imageId: string) {
  const img = await getDb().menuItemImage.findFirst({
    where: { id: imageId, menuItemId: itemId },
    select: { id: true, storagePath: true, menuItem: { select: { slug: true, name: true } } },
  })
  if (!img) throw new AdminRuleError('This image no longer exists.')
  await getDb().menuItemImage.delete({ where: { id: img.id } })
  return { slug: img.menuItem.slug, name: img.menuItem.name, path: img.storagePath }
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function listAdminCategories() {
  const rows = await getDb().menuCategory.findMany({
    orderBy: [{ isArchived: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { items: true } } },
  })
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    iconKey: c.iconKey,
    sortOrder: c.sortOrder,
    isArchived: c.isArchived,
    isDemo: c.isDemo,
    itemCount: c._count.items,
  }))
}
export type AdminCategoryRow = Awaited<ReturnType<typeof listAdminCategories>>[number]

export async function createCategory(input: CategoryInput) {
  return getDb().$transaction(async (tx) => {
    const slug = await uniqueSlug(tx, 'menuCategory', input.name)
    return tx.menuCategory.create({
      data: { ...input, slug, isDemo: false },
      select: { id: true, name: true },
    })
  })
}

export async function updateCategory(id: string, input: CategoryInput) {
  const res = await getDb().menuCategory.updateMany({ where: { id }, data: input })
  if (res.count === 0) throw new AdminRuleError('This category no longer exists.')
}

/** Archiving a category hides all its items publicly (publicItemWhere checks the category). */
export async function setCategoryArchived(id: string, isArchived: boolean) {
  const res = await getDb().menuCategory.updateMany({ where: { id }, data: { isArchived } })
  if (res.count === 0) throw new AdminRuleError('This category no longer exists.')
}

/** Hard delete only for an archived, empty category (items are never orphaned). */
export async function deleteCategory(id: string) {
  const cat = await getDb().menuCategory.findUnique({
    where: { id },
    select: { name: true, isArchived: true, _count: { select: { items: true } } },
  })
  if (!cat) throw new AdminRuleError('This category no longer exists.')
  if (!cat.isArchived) throw new AdminRuleError('Archive the category before deleting it.')
  if (cat._count.items > 0)
    throw new AdminRuleError('Move or delete its items first: this category still has items.')
  await getDb().menuCategory.delete({ where: { id } })
  return cat.name
}
