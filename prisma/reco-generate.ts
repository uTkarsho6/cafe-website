/**
 * Generates the DEMO feedback dataset (RECOMMENDATION §3, ADR-071). Run: `npm run reco:generate`.
 * - Reads the live menu; writes only DemoVisit/DemoRating (never the real Feedback table).
 * - Refuses when demo rows already exist unless `--replace` (then both demo tables are replaced in
 *   one transaction). Refused in production unless `--production` (DEPLOYMENT.md §14).
 * - Deterministic: same menu + seed → same rows (`--seed N` only for experiments; default 2026).
 */
import { scriptClient } from './client'
import { guardProduction, loadMenuForReco } from './reco-menu'
import {
  DEFAULT_SEED,
  GENERATOR_VERSION,
  generateDemoFeedback,
  istToDate,
} from '../src/lib/reco/demo-feedback'

function seedArg(): number {
  const i = process.argv.indexOf('--seed')
  if (i < 0) return DEFAULT_SEED
  const n = Number(process.argv[i + 1])
  if (!Number.isInteger(n) || n < 0) throw new Error('--seed must be a non-negative integer.')
  return n
}

async function main() {
  guardProduction('generate demo feedback')
  const replace = process.argv.includes('--replace')
  const seed = seedArg()
  const db = scriptClient()
  try {
    const existing = await db.demoRating.count()
    if (existing > 0 && !replace) {
      console.error(`Refused: ${existing} demo ratings exist. Add --replace to regenerate them.`)
      process.exit(1)
    }
    const { items, ids } = await loadMenuForReco(db)
    if (items.length < 10)
      throw new Error(`Only ${items.length} available dishes: import the menu first.`)
    const data = generateDemoFeedback(items, { seed })

    await db.$transaction(
      async (tx) => {
        await tx.demoRating.deleteMany({})
        await tx.demoVisit.deleteMany({})
        await tx.demoVisit.createMany({
          data: data.visits.map((v) => ({
            visitNo: v.visitNo,
            demoUserNo: v.demoUserNo,
            visitedAt: istToDate(v.visitedAtIst),
            daypart: v.daypart,
            pattern: v.pattern,
            generatorVersion: GENERATOR_VERSION,
          })),
        })
        const visitIds = new Map(
          (await tx.demoVisit.findMany({ select: { id: true, visitNo: true } })).map((v) => [
            v.visitNo,
            v.id,
          ]),
        )
        await tx.demoRating.createMany({
          data: data.ratings.map((r) => ({
            feedbackNo: r.feedbackNo,
            visitId: visitIds.get(r.visitNo)!,
            demoUserNo: r.demoUserNo,
            menuItemId: ids.get(r.itemSlug)!,
            rating: r.rating,
            sentiment: r.sentiment,
            comment: r.comment,
            ratedAt: istToDate(r.ratedAtIst),
          })),
        })
      },
      { timeout: 60_000 },
    )
    const dist = [1, 2, 3, 4, 5].map(
      (n) =>
        `${n}★ ${((100 * data.ratings.filter((r) => r.rating === n).length) / data.ratings.length).toFixed(1)}%`,
    )
    console.log(
      `Demo feedback written: ${data.visits.length} visits, ${data.ratings.length} ratings, ` +
        `${new Set(data.ratings.map((r) => r.demoUserNo)).size} demo users, ${items.length} dishes (seed ${seed}).`,
    )
    console.log(`Rating mix: ${dist.join(' · ')}`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
