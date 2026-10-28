import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addOnGroupsSchema,
  categoryInputSchema,
  itemInputSchema,
  type ItemInput,
} from '@/lib/validation/admin-menu'
import { menuQuerySchema } from '@/lib/validation/public'
import * as admin from '@/server/services/admin-menu'
import { getMenuItemBySlug, listMenuItems } from '@/server/services/menu'
import { db } from './helpers'

/** Phase 5B service layer against the throwaway test database (TC-ADM-001…010). */
let categoryId = ''
let otherId = ''
const created: string[] = []

const item = (patch: Record<string, string> = {}): ItemInput =>
  itemInputSchema.parse({
    name: 'Test Paneer Wrap',
    description: 'A test item created by the integration suite.',
    price: '149',
    categoryId,
    dietType: 'VEG',
    isAvailable: 'on',
    isPublished: 'on',
    ...patch,
  })

beforeAll(async () => {
  const cat = await admin.createCategory(
    categoryInputSchema.parse({ name: 'Test Wraps 5B', iconKey: 'SANDWICH' }),
  )
  categoryId = cat.id
  const other = await admin.createItem(item({ name: 'Test Side Fries' }))
  otherId = other.id
  created.push(other.id)
})

afterAll(async () => {
  await db().menuItem.deleteMany({ where: { id: { in: created } } })
  await db().menuCategory.deleteMany({ where: { name: { startsWith: 'Test ' } } })
})

const publicQuery = (q: string) => menuQuerySchema.parse({ q })

describe('item create / update (TC-ADM-001/002)', () => {
  it('creates an item with a unique slug, not demo, visible publicly', async () => {
    const a = await admin.createItem(item())
    const b = await admin.createItem(item())
    created.push(a.id, b.id)
    expect(a.slug).toBe('test-paneer-wrap')
    expect(b.slug).toBe('test-paneer-wrap-2')
    const row = await db().menuItem.findUniqueOrThrow({ where: { id: a.id } })
    expect(row).toMatchObject({ pricePaise: 14900, isDemo: false, isAvailable: true })
    const pub = await getMenuItemBySlug(a.slug)
    expect(pub?.priceLabel).toBe('₹149')
  })

  it('updates price and name, keeps the slug, persists (re-read from the database)', async () => {
    const a = await admin.createItem(item({ name: 'Test Rename Me' }))
    created.push(a.id)
    await admin.updateItem(a.id, item({ name: 'Test Renamed', price: '175.50' }))
    const row = await db().menuItem.findUniqueOrThrow({ where: { id: a.id } })
    expect(row).toMatchObject({ name: 'Test Renamed', slug: 'test-rename-me', pricePaise: 17550 })
    expect((await getMenuItemBySlug('test-rename-me'))?.priceLabel).toBe('₹175.50')
  })

  it('rejects an unknown category and a missing item with a safe message', async () => {
    await expect(
      admin.createItem({ ...item(), categoryId: 'cmf0000000000000000000000' }),
    ).rejects.toBeInstanceOf(admin.AdminRuleError)
    await expect(admin.updateItem('cmf0000000000000000000000', item())).rejects.toThrow(
      'This item no longer exists.',
    )
  })
})

describe('availability, archive, delete (TC-ADM-003/005)', () => {
  it('availability change shows publicly as out of stock (never as available)', async () => {
    const a = await admin.createItem(item({ name: 'Test Stock Toggle' }))
    created.push(a.id)
    await admin.setItemAvailability(a.id, false)
    expect((await getMenuItemBySlug(a.slug))?.isAvailable).toBe(false)
    const list = await listMenuItems(publicQuery('Test Stock Toggle'))
    expect(list.items.map((i) => [i.slug, i.isAvailable])).toEqual([[a.slug, false]])
    await admin.setItemAvailability(a.id, true)
    expect((await getMenuItemBySlug(a.slug))?.isAvailable).toBe(true)
  })

  it('archive hides an item publicly; restore shows it again; delete needs archive first', async () => {
    const a = await admin.createItem(item({ name: 'Test Archive Me' }))
    created.push(a.id)
    await expect(admin.deleteItem(a.id)).rejects.toThrow('Archive the item before deleting it.')
    await admin.setItemArchived(a.id, true)
    expect(await getMenuItemBySlug(a.slug)).toBeNull()
    expect((await listMenuItems(publicQuery('Test Archive Me'))).items).toHaveLength(0)
    await admin.setItemArchived(a.id, false)
    expect(await getMenuItemBySlug(a.slug)).not.toBeNull()
    await admin.setItemArchived(a.id, true)
    const del = await admin.deleteItem(a.id)
    expect(del.slug).toBe(a.slug)
    expect(await db().menuItem.findUnique({ where: { id: a.id } })).toBeNull()
  })

  it('an item used by an offer can be archived but never hard-deleted', async () => {
    const a = await admin.createItem(item({ name: 'Test In Combo' }))
    created.push(a.id)
    const offer = await db().offer.create({
      data: {
        kind: 'COMBO',
        promoPricePaise: 19900,
        title: 'Test combo 5B',
        slug: 'test-combo-5b',
        description: 'Integration test combo',
        startsAt: new Date(Date.now() - 1000),
        endsAt: new Date(Date.now() + 86_400_000),
        items: { create: { menuItemId: a.id } },
      },
    })
    await admin.setItemArchived(a.id, true)
    await expect(admin.deleteItem(a.id)).rejects.toThrow(/part of an offer/)
    await db().offer.delete({ where: { id: offer.id } })
  })
})

describe('quick edits from the item list (Round 2C, TC-ADM-011)', () => {
  it('inline price and label toggles persist and show publicly', async () => {
    const a = await admin.createItem(item({ name: 'Test Quick Edit' }))
    created.push(a.id)
    await admin.setItemPrice(a.id, 17950)
    await admin.setItemFlag(a.id, 'isTrending', true)
    await admin.setItemFlag(a.id, 'isBestSeller', true)
    await admin.setItemFlag(a.id, 'isBestSeller', false)
    const row = await db().menuItem.findUniqueOrThrow({ where: { id: a.id } })
    expect(row).toMatchObject({ pricePaise: 17950, isTrending: true, isBestSeller: false })
    expect((await getMenuItemBySlug(a.slug))?.priceLabel).toBe('₹179.50')
  })

  it('refuses a missing item; the database CHECK still rejects a zero price', async () => {
    const missing = 'cmf0000000000000000000099'
    await expect(admin.setItemPrice(missing, 100)).rejects.toThrow('no longer exists')
    await expect(admin.setItemFlag(missing, 'isFeatured', true)).rejects.toThrow('no longer exists')
    await expect(admin.setItemPrice(otherId, 0)).rejects.toThrow()
  })
})

describe('add-ons and linked items (TC-ADM-004/007)', () => {
  it('replaces add-ons atomically and the public page shows them', async () => {
    const a = await admin.createItem(item({ name: 'Test Addon Host' }))
    created.push(a.id)
    const groups = addOnGroupsSchema.parse([
      {
        name: 'Extras',
        minSelect: 0,
        maxSelect: 2,
        options: [
          { name: 'Cheese', price: '20', isAvailable: true },
          { name: 'Jalapeño', price: '15', isAvailable: false },
        ],
      },
    ])
    await admin.replaceAddOns(a.id, groups)
    await admin.replaceAddOns(a.id, groups) // replacing twice must not duplicate
    const pub = await getMenuItemBySlug(a.slug)
    expect(pub?.addOnGroups).toHaveLength(1)
    expect(pub?.addOnGroups[0]?.options.map((o) => [o.name, o.priceDeltaPaise])).toEqual([
      ['Cheese', 2000],
      ['Jalapeño', 1500],
    ])
    await admin.replaceAddOns(a.id, [])
    expect((await getMenuItemBySlug(a.slug))?.addOnGroups).toHaveLength(0)
  })

  it('links related / bought-together items; refuses self-links and unknown items', async () => {
    const a = await admin.createItem(item({ name: 'Test Relation Host' }))
    created.push(a.id)
    await admin.replaceRelations(a.id, { related: [otherId], together: [otherId] })
    const pub = await getMenuItemBySlug(a.slug)
    expect(pub?.related.map((r) => r.name)).toEqual(['Test Side Fries'])
    expect(pub?.frequentlyBoughtTogether.map((r) => r.name)).toEqual(['Test Side Fries'])
    await expect(admin.replaceRelations(a.id, { related: [a.id], together: [] })).rejects.toThrow(
      /itself/,
    )
    await expect(
      admin.replaceRelations(a.id, { related: ['cmf0000000000000000000000'], together: [] }),
    ).rejects.toThrow(/no longer exists/)
    // The failed calls changed nothing (transaction).
    expect((await getMenuItemBySlug(a.slug))?.related).toHaveLength(1)
  })
})

describe('images (TC-ADM-006, metadata rows only; files are tested in unit/E2E)', () => {
  it('adds, replaces in place, scopes removal to the item, caps at 4', async () => {
    const a = await admin.createItem(item({ name: 'Test Image Host' }))
    created.push(a.id)
    const p = (n: number) => `items/${a.id}/00000000-0000-4000-8000-00000000000${n}.webp`
    await admin.addItemImage(a.id, p(1), 'First photo')
    const first = await db().menuItemImage.findFirstOrThrow({ where: { menuItemId: a.id } })
    const rep = await admin.addItemImage(a.id, p(2), 'Replacement', first.id)
    expect(rep.oldPath).toBe(p(1))
    const rows = await db().menuItemImage.findMany({ where: { menuItemId: a.id } })
    expect(rows.map((r) => [r.storagePath, r.sortOrder])).toEqual([[p(2), 0]])
    // Another item's ID cannot remove this image (IDOR).
    await expect(admin.removeItemImage(otherId, rows[0]!.id)).rejects.toThrow(/no longer exists/)
    for (let n = 3; n <= 5; n++) await admin.addItemImage(a.id, p(n), 'More')
    await expect(admin.addItemImage(a.id, p(8), 'Too many')).rejects.toThrow(/at most 4/)
    const removed = await admin.removeItemImage(a.id, rows[0]!.id)
    expect(removed.path).toBe(p(2))
    // Reorder: the image at position 1 moves first, and back again.
    const order = async () =>
      (
        await db().menuItemImage.findMany({
          where: { menuItemId: a.id },
          orderBy: { sortOrder: 'asc' },
        })
      ).map((r) => r.storagePath)
    const before = await order()
    const second = await db().menuItemImage.findFirstOrThrow({ where: { storagePath: before[1] } })
    await admin.moveItemImage(a.id, second.id, -1)
    expect(await order()).toEqual([before[1], before[0], ...before.slice(2)])
    await admin.moveItemImage(a.id, second.id, -1) // already first: no change
    expect((await order())[0]).toBe(before[1])
    await expect(admin.moveItemImage(otherId, second.id, 1)).rejects.toThrow(/no longer exists/)
    await admin.moveItemImage(a.id, second.id, 1)
    expect(await order()).toEqual(before)
    // The freed position 0 is reused even though position 3 is taken.
    await admin.addItemImage(a.id, p(9), 'Refill')
    expect(
      (await db().menuItemImage.findFirstOrThrow({ where: { storagePath: p(9) } })).sortOrder,
    ).toBe(0)
  })
})

describe('categories (TC-ADM-008)', () => {
  it('create, rename, archive hides its items publicly, delete only when empty', async () => {
    const cat = await admin.createCategory(
      categoryInputSchema.parse({ name: 'Test Temp Cat', iconKey: 'GENERAL' }),
    )
    const a = await admin.createItem({ ...item({ name: 'Test Cat Item' }), categoryId: cat.id })
    created.push(a.id)
    await admin.updateCategory(
      cat.id,
      categoryInputSchema.parse({ name: 'Test Temp Cat 2', iconKey: 'PIZZA' }),
    )
    await admin.setCategoryArchived(cat.id, true)
    expect(await getMenuItemBySlug(a.slug)).toBeNull()
    await expect(admin.deleteCategory(cat.id)).rejects.toThrow(/still has items/)
    await db().menuItem.delete({ where: { id: a.id } })
    expect(await admin.deleteCategory(cat.id)).toBe('Test Temp Cat 2')
  })
  it('refuses to delete an active category', async () => {
    await expect(admin.deleteCategory(categoryId)).rejects.toThrow(/Archive the category/)
  })
})

describe('admin list', () => {
  it('filters by search, category and status; archived only on request', async () => {
    const res = await admin.listAdminItems({
      q: 'test side',
      category: categoryId,
      status: 'all',
      page: 1,
    })
    expect(res.items.map((i) => i.name)).toEqual(['Test Side Fries'])
    const archived = await admin.listAdminItems({ q: undefined, status: 'archived', page: 1 })
    expect(archived.items.every((i) => i.isArchived)).toBe(true)
  })
})
