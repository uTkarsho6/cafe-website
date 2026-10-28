/**
 * Registers the gallery photos kept in public/photos/ (ADR-056, ADR-058): the Sangli outlet's own
 * photos, photos of other ZORKO cafés and official ZORKO food photos (owner's permission). Safe to
 * run more than once: a photo already in the gallery is skipped, and nothing is ever deleted or
 * unpublished. After this, manage the photos in Admin → Gallery like any other.
 *
 *   npm run gallery:outlet-photos -- list
 *   npm run gallery:outlet-photos -- add
 *   npm run gallery:outlet-photos -- repair   (re-points rows whose local file is missing, see LEGACY)
 */
import { existsSync } from 'node:fs'
import { scriptClient } from './client'

/**
 * Alt text describes what is visible. Captions say where a photo comes from, so photos of other
 * ZORKO cafés and brand food photos are never presented as taken at the Sangli outlet.
 */
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
  {
    storagePath: 'photos/zorko-cafe-popart-wall.webp',
    altText:
      'ZORKO café seating with orange and green chairs, hanging plants and pop-art wall murals',
    caption: 'A ZORKO café (brand photo)',
  },
  {
    storagePath: 'photos/zorko-cafe-blue-booths.webp',
    altText:
      'Blue quilted booth seating and round white tables beside a glass door in a ZORKO café',
    caption: 'A ZORKO café (brand photo)',
  },
  {
    storagePath: 'photos/zorko-cafe-floral-ceiling.webp',
    altText:
      'ZORKO café dining room with a hanging lavender flower ceiling and green velvet booths',
    caption: 'A ZORKO café (brand photo)',
  },
  {
    storagePath: 'photos/brand-paneer-burger.webp',
    altText: 'Grilled paneer burger with onion, tomato and lettuce on a black plate',
    caption: 'ZORKO brand food photo',
  },
  {
    storagePath: 'photos/brand-kulhad-maggi.webp',
    altText: 'Cheese-topped noodles served in a clay kulhad cup',
    caption: 'ZORKO brand food photo',
  },
  {
    storagePath: 'photos/brand-blue-mojito.webp',
    altText: 'Blue mojito with ice, lime and mint in a tall glass',
    caption: 'ZORKO brand food photo',
  },
  {
    storagePath: 'photos/brand-oreo-shake.webp',
    altText: 'Chocolate cookie shake topped with crushed cookies and a whole cookie',
    caption: 'ZORKO brand food photo',
  },
] as const

/**
 * Rows added by the unofficial copy of the project whose files do not exist here (Round 2A
 * review). `repair` points them at the matching photo instead of deleting them.
 */
export const LEGACY: Record<string, string> = {
  'stock/zorko-cafe-blue-lounge.webp': 'photos/zorko-cafe-blue-booths.webp',
  'stock/zorko-cafe-dining-hall.webp': 'photos/zorko-cafe-floral-ceiling.webp',
}

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
    } else if (command === 'repair') {
      for (const [from, to] of Object.entries(LEGACY)) {
        const photo = OUTLET_PHOTOS.find((p) => p.storagePath === to)!
        const taken = await db.galleryImage.count({ where: { storagePath: to } })
        if (taken > 0 || existsSync(`public/${from}`)) {
          console.log(`Skipped: ${from}`)
          continue
        }
        const res = await db.galleryImage.updateMany({
          where: { storagePath: from },
          data: { storagePath: to, altText: photo.altText, caption: photo.caption },
        })
        console.log(res.count ? `Repaired: ${from} -> ${to}` : `Not found: ${from}`)
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
      console.error('Usage: npm run gallery:outlet-photos -- <list|add|repair>')
      process.exit(1)
    }
  } finally {
    await db.$disconnect()
  }
}

// Run only as a script, so tests can import OUTLET_PHOTOS.
if (process.argv[1]?.endsWith('outlet-photos.ts')) void main()
