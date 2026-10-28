import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mediaUrl } from '@/lib/media'
import { LEGACY, OUTLET_PHOTOS } from '../../prisma/outlet-photos'

// TC-UNIT-120: the outlet photos registered by `npm run gallery:outlet-photos` (ADR-056).
describe('outlet gallery photos (TC-UNIT-120)', () => {
  it.each(OUTLET_PHOTOS)('$storagePath exists, resolves locally and fits the schema', (p) => {
    expect(existsSync(`public/${p.storagePath}`)).toBe(true)
    expect(mediaUrl(p.storagePath)).toBe(`/${p.storagePath}`)
    // GalleryImage column limits: altText VarChar(150), caption VarChar(120).
    expect(p.altText.length).toBeGreaterThan(10)
    expect(p.altText.length).toBeLessThanOrEqual(150)
    expect(p.caption.length).toBeLessThanOrEqual(120)
  })
  it('has no duplicate paths', () =>
    expect(new Set(OUTLET_PHOTOS.map((p) => p.storagePath)).size).toBe(OUTLET_PHOTOS.length))
  it('repair targets are listed photos, and repaired paths really are missing files', () => {
    for (const [from, to] of Object.entries(LEGACY)) {
      expect(OUTLET_PHOTOS.some((p) => p.storagePath === to)).toBe(true)
      expect(existsSync(`public/${from}`)).toBe(false)
    }
  })
  it('photos of other ZORKO cafés and food are captioned as brand photos, never as Sangli', () => {
    for (const p of OUTLET_PHOTOS.filter((x) => !x.storagePath.startsWith('photos/outlet-')))
      expect(p.caption).toMatch(/brand/i)
  })
})
