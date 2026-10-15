// @vitest-environment node
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  MAX_UPLOAD_BYTES,
  UploadRejected,
  itemImagePath,
  processImageUpload,
  sniffImageType,
} from '@/server/media/image-upload'

const make = (w: number, h: number, format: 'png' | 'jpeg' | 'webp' | 'gif') =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#a93200' } })
    .toFormat(format)
    .toBuffer()

const file = (bytes: Uint8Array | Buffer, name = 'photo.png', type = 'image/png') =>
  new File([new Uint8Array(bytes)], name, { type })

async function rejected(f: File | null) {
  const err = await processImageUpload(f).catch((e: unknown) => e)
  expect(err).toBeInstanceOf(UploadRejected)
  return (err as Error).message
}

describe('image upload validation (TC-SEC-015 / TC-ADM-006)', () => {
  it.each(['png', 'jpeg', 'webp'] as const)('accepts %s and re-encodes it to WebP', async (fmt) => {
    const out = await processImageUpload(file(await make(400, 300, fmt)))
    expect(sniffImageType(out)).toBe('webp')
    expect((await sharp(out).metadata()).width).toBe(400)
  })

  it('strips EXIF metadata (e.g. GPS) and downsizes large images', async () => {
    const withExif = await sharp(await make(2400, 1800, 'jpeg'))
      .withExif({ IFD0: { Copyright: 'secret-location' } })
      .jpeg()
      .toBuffer()
    expect((await sharp(withExif).metadata()).exif).toBeDefined()
    const out = await processImageUpload(file(withExif, 'a.jpg', 'image/jpeg'))
    const meta = await sharp(out).metadata()
    expect(meta.exif).toBeUndefined()
    expect(meta.width).toBe(1600)
  })

  it('rejects a disguised file: text renamed to .png with an image MIME type', async () => {
    expect(await rejected(file(Buffer.from('<?php echo 1; ?>'), 'shell.png'))).toMatch(/Only JPEG/)
  })
  it('rejects SVG (script-capable) and GIF', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    )
    expect(await rejected(file(svg, 'x.svg', 'image/svg+xml'))).toMatch(/Only JPEG/)
    expect(await rejected(file(await make(300, 300, 'gif'), 'x.png'))).toMatch(/Only JPEG/)
  })
  it('rejects a valid PNG header followed by garbage (damaged or polyglot file)', async () => {
    const fake = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(500, 7),
    ])
    expect(await rejected(file(fake))).toMatch(/could not be read/)
  })
  it('rejects files over 5 MB without reading them', async () => {
    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'big.png', { type: 'image/png' })
    expect(await rejected(big)).toMatch(/5 MB/)
  })
  it('rejects too-small and too-large dimensions, and empty input', async () => {
    expect(await rejected(file(await make(100, 100, 'png')))).toMatch(/at least 200/)
    expect(await rejected(file(await make(6100, 300, 'png')))).toMatch(/at most 6000/)
    expect(await rejected(null)).toMatch(/Choose an image/)
    expect(await rejected(file(new Uint8Array()))).toMatch(/Choose an image/)
  })
  it('generates safe, unguessable paths and refuses path tricks', () => {
    expect(itemImagePath('cmf0000000000000000000001')).toMatch(
      /^items\/cmf0000000000000000000001\/[0-9a-f-]{36}\.webp$/,
    )
    expect(() => itemImagePath('../../etc')).toThrow()
  })
})
