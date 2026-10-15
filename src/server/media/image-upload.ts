import 'server-only'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'

/**
 * Image upload validation (CLAUDE.md §9.7, ADR-049). The file's own bytes decide its type, never
 * its name or the browser's MIME type. Accepted files are decoded and re-encoded to WebP, which
 * also drops EXIF/GPS metadata and anything appended to the file.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const MIN_DIMENSION = 200
export const MAX_DIMENSION = 6000
const OUTPUT_MAX_WIDTH = 1600

export type ImageKind = 'jpeg' | 'png' | 'webp'

/** Magic-byte sniffing for the three allowed formats. */
export function sniffImageType(bytes: Uint8Array): ImageKind | null {
  const b = bytes
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (b.length >= 8 && png.every((v, i) => b[i] === v)) return 'png'
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to))
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  return null
}

export class UploadRejected extends Error {}

/** Validates and normalises an upload. Returns WebP bytes ready for Storage. */
export async function processImageUpload(file: File | null | undefined): Promise<Buffer> {
  if (!file || typeof file === 'string' || file.size === 0)
    throw new UploadRejected('Choose an image file.')
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadRejected('The image must be 5 MB or smaller.')

  const input = new Uint8Array(await file.arrayBuffer())
  const kind = sniffImageType(input)
  if (!kind) throw new UploadRejected('Only JPEG, PNG or WebP images are allowed.')

  try {
    // limitInputPixels guards against decompression bombs before decoding.
    const image = sharp(input, { limitInputPixels: MAX_DIMENSION * MAX_DIMENSION, failOn: 'error' })
    const meta = await image.metadata()
    if (meta.format !== kind)
      throw new UploadRejected('The file content does not match an allowed image type.')
    const { width = 0, height = 0 } = meta
    if (width < MIN_DIMENSION || height < MIN_DIMENSION)
      throw new UploadRejected(`The image must be at least ${MIN_DIMENSION}×${MIN_DIMENSION} px.`)
    if (width > MAX_DIMENSION || height > MAX_DIMENSION)
      throw new UploadRejected(`The image can be at most ${MAX_DIMENSION} px on each side.`)
    return await image
      .rotate() // apply the EXIF orientation before the metadata is dropped
      .resize({ width: OUTPUT_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
  } catch (error) {
    if (error instanceof UploadRejected) throw error
    throw new UploadRejected('The image could not be read. It may be damaged or disguised.')
  }
}

/** Generated, unguessable Storage path (matches `STORAGE_PATH` in src/lib/media.ts). */
export function itemImagePath(itemId: string): string {
  if (!/^[a-z0-9]{20,40}$/.test(itemId)) throw new Error('invalid item id')
  return `items/${itemId}/${randomUUID()}.webp`
}

/** Generated path for gallery, banner and offer images (also matches `STORAGE_PATH`). */
export function mediaPath(folder: 'gallery' | 'banners' | 'offers'): string {
  return `${folder}/${randomUUID()}.webp`
}
