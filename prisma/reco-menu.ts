/**
 * Shared helpers for the recommendation scripts (Phase R1): load the live menu in the shape the
 * pure generator expects, and refuse production without `--production` (DEPLOYMENT.md §14).
 */
import type { PrismaClient } from '../src/generated/prisma/client'
import type { MenuItemInput } from '../src/lib/reco/demo-feedback'

export function guardProduction(what: string): void {
  const isProduction =
    process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
  if (isProduction && !process.argv.includes('--production')) {
    console.error(`Refused: add --production to ${what} in production (DEPLOYMENT.md §14).`)
    process.exit(1)
  }
}

/**
 * Published, non-archived dishes of non-archived categories, in menu order. Availability is ignored
 * on purpose: "sold out" is temporary, and sold-out dishes are filtered when recommendations are
 * shown (RECOMMENDATION §4.7), not removed from the data.
 */
export async function loadMenuForReco(
  db: PrismaClient,
): Promise<{ items: MenuItemInput[]; ids: Map<string, string>; itemNos: Map<string, number> }> {
  const rows = await db.menuItem.findMany({
    where: { isPublished: true, isArchived: false, category: { isArchived: false } },
    select: {
      id: true,
      slug: true,
      name: true,
      pricePaise: true,
      flavorTags: true,
      isBestSeller: true,
      isTrending: true,
      category: { select: { slug: true, mealRole: true } },
    },
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { slug: 'asc' }],
  })
  return {
    items: rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      categorySlug: r.category.slug,
      mealRole: r.category.mealRole,
      pricePaise: r.pricePaise,
      flavorTags: r.flavorTags,
      isBestSeller: r.isBestSeller,
      isTrending: r.isTrending,
    })),
    ids: new Map(rows.map((r) => [r.slug, r.id])),
    // The CSV's numeric item_id: position in menu order, 1-based (like the team's file).
    itemNos: new Map(rows.map((r, k) => [r.slug, k + 1])),
  }
}
