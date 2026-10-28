import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { categoryPhoto } from '@/features/menu/category-photos'
import { sangliMenu } from '../../prisma/data/sangli-menu'

// TC-UNIT-121: homepage category thumbnails (ADR-060).
describe('category photos (TC-UNIT-121)', () => {
  it('every mapped photo file exists in public/, and every real category has one', () => {
    const urls = sangliMenu.map((c) => categoryPhoto(c.slug)).filter((u): u is string => !!u)
    for (const url of urls) expect(existsSync(`public${url}`), url).toBe(true)
    expect(urls.length).toBe(sangliMenu.length) // all 16 real categories
  })
  it('categories without a ZORKO photo fall back to the icon (no stand-in images)', () => {
    expect(categoryPhoto('sangli-special')).toBeNull()
    expect(categoryPhoto('../etc')).toBeNull()
  })
})
