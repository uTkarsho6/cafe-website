/**
 * Exports the recommendation data for the Python notebook (RECOMMENDATION §3.7):
 * data/reco/menu_items.csv and data/reco/demo_feedback.csv. Run: `npm run reco:export`
 * (`-- --out <dir>` writes elsewhere; the integration test uses a temporary folder).
 * Read-only. Contains only public menu data and DEMO ratings (no personal data).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriptClient } from './client'
import { loadMenuForReco } from './reco-menu'
import { feedbackToCsv, type DemoFeedbackDataset } from '../src/lib/reco/demo-feedback'

const IST_OFFSET_MS = 330 * 60_000
const ist = (d: Date) =>
  new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
const cell = (v: string | number | boolean) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function outDir(): string {
  const i = process.argv.indexOf('--out')
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : 'data/reco'
}

async function main() {
  const out = outDir()
  const db = scriptClient()
  try {
    const { items, itemNos } = await loadMenuForReco(db)
    const full = await db.menuItem.findMany({
      where: { slug: { in: items.map((i) => i.slug) } },
      select: { slug: true, description: true },
    })
    const desc = new Map(full.map((f) => [f.slug, f.description]))
    const menuLines = [
      'item_id,item_slug,item_name,category,meal_role,price_rupees,is_best_seller,is_trending,flavor_tags,description',
      ...items.map((i) =>
        [
          itemNos.get(i.slug)!,
          i.slug,
          i.name,
          i.categorySlug,
          i.mealRole,
          i.pricePaise / 100,
          i.isBestSeller,
          i.isTrending,
          i.flavorTags.join('|'),
          desc.get(i.slug) ?? '',
        ]
          .map(cell)
          .join(','),
      ),
    ]

    const ratings = await db.demoRating.findMany({
      orderBy: { feedbackNo: 'asc' },
      select: {
        feedbackNo: true,
        demoUserNo: true,
        rating: true,
        sentiment: true,
        comment: true,
        ratedAt: true,
        visit: { select: { visitNo: true } },
        menuItem: { select: { slug: true } },
      },
    })
    const dataset: DemoFeedbackDataset = {
      visits: [],
      ratings: ratings.map((r) => ({
        feedbackNo: r.feedbackNo,
        visitNo: r.visit.visitNo,
        demoUserNo: r.demoUserNo,
        itemSlug: r.menuItem.slug,
        rating: r.rating as 1 | 2 | 3 | 4 | 5,
        sentiment: r.sentiment,
        comment: r.comment,
        ratedAtIst: ist(r.ratedAt),
      })),
    }
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'menu_items.csv'), menuLines.join('\n') + '\n')
    writeFileSync(join(out, 'demo_feedback.csv'), feedbackToCsv(dataset, items, itemNos))
    console.log(`Exported ${items.length} dishes and ${ratings.length} demo ratings to ${out}/.`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
