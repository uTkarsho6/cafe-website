/**
 * Trains the recommender and activates the run if it passes the quality gate (RECOMMENDATION §5).
 * Run: `npm run reco:train`. Refused in production unless `--production` (DEPLOYMENT.md §14).
 * Public pages pick up the new lists within their 30 s cache window.
 */
import { scriptClient } from './client'
import { guardProduction } from './reco-menu'
import { trainAndActivate } from '../src/server/reco/train'

async function main() {
  guardProduction('train the recommender')
  const db = scriptClient()
  try {
    const result = await trainAndActivate(db)
    if (result.status === 'QUEUED') {
      console.log(
        'Another training run is in progress; this request was queued and will run after it.',
      )
      return
    }
    const m = result.metrics
    console.log(
      `Run v${result.version}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`,
    )
    if (m)
      console.log(
        `HitRate@5 goes-well-with ${m.hitRate5Complement.toFixed(3)} (popularity ${m.baselineHitRate5.toFixed(3)}), ` +
          `you-may-also-like ${m.hitRate5Similar.toFixed(3)} (popularity ${m.baselineSimilar.toFixed(3)}), ` +
          `coverage ${(m.coverage * 100).toFixed(1)} %, RMSE ${m.rmse.toFixed(3)}`,
      )
    if (result.status !== 'ACTIVE') process.exitCode = 1
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
