import { describe, expect, it } from 'vitest'
import {
  addOnGroupsSchema,
  adminItemQuerySchema,
  categoryInputSchema,
  itemInputSchema,
  relationsSchema,
  rupeesToPaise,
  slugify,
} from '@/lib/validation/admin-menu'

const CAT = 'cmf0000000000000000000001'
const validItem = {
  name: 'Paneer Wrap',
  description: 'Soft wrap with grilled paneer.',
  price: '149.50',
  categoryId: CAT,
  dietType: 'VEG',
  isAvailable: 'on',
}

describe('price parsing (TC-ADM-001)', () => {
  it.each([
    ['149', 14900],
    ['149.5', 14950],
    ['149.50', 14950],
    ['0', 0],
    [' 99 ', 9900],
  ])('%s → %i paise', (input, paise) => expect(rupeesToPaise(input)).toBe(paise))
  it.each(['-1', '1.999', 'abc', '', '1e3', '12,000', '0x10', '1234567'])('rejects %s', (input) =>
    expect(rupeesToPaise(input)).toBeNull(),
  )
})

describe('slugify', () => {
  it('makes URL-safe slugs', () => {
    expect(slugify('Paneer Tikka Pizza!')).toBe('paneer-tikka-pizza')
    expect(slugify('  Café Crème  ')).toBe('cafe-creme')
    expect(slugify('<script>')).toBe('script')
    expect(slugify('!!!')).toBe('item')
  })
})

describe('item input (TC-ADM-002, TC-SEC-012 mass assignment)', () => {
  it('accepts a valid item and converts the price and checkboxes', () => {
    const r = itemInputSchema.parse(validItem)
    expect(r).toMatchObject({ price: 14950, isAvailable: true, isPublished: false, sortOrder: 0 })
  })
  it('drops fields an admin may not set (id, slug, isDemo, createdAt, pricePaise)', () => {
    const r = itemInputSchema.parse({
      ...validItem,
      id: 'x',
      slug: 'evil',
      isDemo: 'true',
      createdAt: '2000-01-01',
      pricePaise: '1',
      $ACTION_ID_abc: '',
    })
    expect(Object.keys(r).sort()).toEqual(
      [
        'categoryId',
        'description',
        'dietType',
        'flavorTags', // Phase R5a
        'isAvailable',
        'isBestSeller',
        'isFeatured',
        'isPublished',
        'isTrending',
        'name',
        'price',
        'sortOrder',
      ].sort(),
    )
  })
  it.each([
    ['empty name', { name: ' ' }, 'name'],
    ['short description', { description: 'tiny' }, 'description'],
    ['negative price', { price: '-5' }, 'price'],
    ['zero price', { price: '0' }, 'price'],
    ['price too high', { price: '999999' }, 'price'],
    ['bad category id', { categoryId: "1' OR '1'='1" }, 'categoryId'],
    ['unknown diet', { dietType: 'VEGAN' }, 'dietType'],
    ['negative sort order', { sortOrder: '-1' }, 'sortOrder'],
    ['name too long', { name: 'x'.repeat(81) }, 'name'],
  ])('rejects %s', (_label, patch, field) => {
    const r = itemInputSchema.safeParse({ ...validItem, ...patch })
    expect(r.success).toBe(false)
    expect(r.error!.issues[0]!.path[0]).toBe(field)
  })
  it('keeps XSS text as plain text (escaped on render), strips control characters', () => {
    const r = itemInputSchema.parse({ ...validItem, name: '<img src=x onerror=alert(1)>\u0000' })
    expect(r.name).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('category input', () => {
  it('accepts valid input and drops extra fields', () => {
    const r = categoryInputSchema.parse({
      name: 'Wraps',
      iconKey: 'SANDWICH',
      isDemo: 'true',
      slug: 'x',
    })
    expect(r).toEqual({
      name: 'Wraps',
      description: null,
      iconKey: 'SANDWICH',
      mealRole: 'MAIN', // Phase R5a default
      sortOrder: 0,
    })
  })
  it('rejects an unknown icon', () =>
    expect(categoryInputSchema.safeParse({ name: 'Wraps', iconKey: 'SKULL' }).success).toBe(false))
})

describe('add-ons (TC-ADM-004)', () => {
  const group = {
    name: 'Extra cheese',
    minSelect: 0,
    maxSelect: 1,
    options: [{ name: 'Cheese slice', price: '20', isAvailable: true }],
  }
  it('accepts a valid group and converts option prices', () => {
    expect(addOnGroupsSchema.parse([group])[0]!.options[0]!.price).toBe(2000)
  })
  it('rejects min > max, min > option count, empty groups and unknown keys', () => {
    expect(addOnGroupsSchema.safeParse([{ ...group, minSelect: 2, maxSelect: 1 }]).success).toBe(
      false,
    )
    expect(addOnGroupsSchema.safeParse([{ ...group, minSelect: 2, maxSelect: 3 }]).success).toBe(
      false,
    )
    expect(addOnGroupsSchema.safeParse([{ ...group, options: [] }]).success).toBe(false)
    expect(addOnGroupsSchema.safeParse([{ ...group, menuItemId: 'other' }]).success).toBe(false)
  })
  it('caps groups at 10', () =>
    expect(addOnGroupsSchema.safeParse(Array(11).fill(group)).success).toBe(false))
})

describe('relations', () => {
  it('accepts IDs, rejects junk and more than 8', () => {
    expect(relationsSchema.safeParse({ related: [CAT], together: [] }).success).toBe(true)
    expect(relationsSchema.safeParse({ related: ['../etc'], together: [] }).success).toBe(false)
    expect(relationsSchema.safeParse({ related: Array(9).fill(CAT), together: [] }).success).toBe(
      false,
    )
  })
})

describe('admin list query', () => {
  it('falls back to safe defaults on junk', () => {
    expect(adminItemQuerySchema.parse({ status: 'drop', page: '-3', category: '<x>' })).toEqual({
      q: undefined,
      category: undefined,
      status: 'all',
      page: 1,
    })
  })
})
