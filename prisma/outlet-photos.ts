/**
 * Registers the outlet's own photos (supplied by the team, files in public/photos/) in the gallery
 * (ADR-056). Safe to run more than once: a photo already in the gallery is skipped, and nothing is
 * ever deleted or unpublished. After this, manage the photos in Admin → Gallery like any other.
 *
 *   npm run gallery:outlet-photos -- list
 *   npm run gallery:outlet-photos -- add
 */
import { scriptClient } from './client'

/** Only photos the team confirmed show the Sangli outlet. Alt text describes what is visible. */
export const OUTLET_PHOTOS = [
  {
    storagePath: 'photos/outlet-storefront.webp',
    altText: 'ZORKO Café storefront at night with the lit sign above the glass entrance and steps',
    caption: 'Our storefront',
  },
  {
    storagePath: 'photos/outlet-dining-hall.webp',
    altText:
      'Dining hall with a green leaf ceiling, wooden lattice, lit arched mirrors and teal chairs',
    caption: 'The dining hall',
  },
  {
    storagePath: 'photos/outlet-dining-area.webp',
    altText: 'Rows of tables with teal chairs under pendant lamps, ZORKO sign at the far wall',
    caption: 'Dining area',
  },
  {
    storagePath: 'photos/outlet-green-ceiling.webp',
    altText: 'Green leaf ceiling panel framed by a wooden lattice above the dining hall',
    caption: 'Green ceiling',
  },
  {
    storagePath: 'photos/outlet-arched-mirrors.webp',
    altText:
      'Table for two beside a lit arched mirror, with teal chairs and a patterned tile floor',
    caption: 'Seating by the arched mirrors',
  },
] as const

async function main() {
  const command = process.argv[2]
  if (process.env.VERCEL_ENV === 'production' && !process.argv.includes('--production')) {
    console.error('Refused: add --production to change the production gallery.')
    process.exit(1)
  }
  const db = scriptClient()
  try {
    if (command === 'add') {
      const existing = new Set(
        (await db.galleryImage.findMany({ select: { storagePath: true } })).map(
          (g) => g.storagePath,
        ),
      )
      const last = await db.galleryImage.aggregate({ _max: { sortOrder: true } })
      let order = (last._max.sortOrder ?? -1) + 1
      for (const photo of OUTLET_PHOTOS) {
        if (existing.has(photo.storagePath)) {
          console.log(`Skipped (already in the gallery): ${photo.storagePath}`)
          continue
        }
        await db.galleryImage.create({
          data: { ...photo, sortOrder: order++, isPublished: true, isDemo: false },
        })
        console.log(`Added: ${photo.storagePath}`)
      }
    } else if (command === 'list') {
      const rows = await db.galleryImage.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { storagePath: true, isPublished: true, isDemo: true },
      })
      for (const r of rows)
        console.log(
          `${r.isPublished ? 'published  ' : 'unpublished'} ${r.isDemo ? 'demo' : 'real'}  ${r.storagePath}`,
        )
      console.log(`${rows.length} gallery photo(s).`)
    } else {
      console.error('Usage: npm run gallery:outlet-photos -- <list|add>')
      process.exit(1)
    }
  } finally {
    await db.$disconnect()
  }
}

// Run only as a script, so tests can import OUTLET_PHOTOS.
if (process.argv[1]?.endsWith('outlet-photos.ts')) void main()
