import 'server-only'
import { getDb } from '../db'

/**
 * Read side of the admin recommendations page (FR-067, Phase R5; UI_SPEC §13).
 * Admin-only data: scores and score components are shown here and NEVER on public pages or APIs.
 * Callers must have passed `requireAdmin()`.
 */

export type RecoRunRow = {
  id: string
  version: number
  status: string
  trainedAt: string | null
  rmse: number | null
  hitRate5Complement: number | null
  hitRate5Similar: number | null
  coverage: number | null
  ratingCount: number
  itemCount: number
  gateReason: string | null
  startedBy: string
}

export type RecoOverview = {
  enabled: boolean
  training: boolean
  weights: {
    compCoocPm: number
    compQualityPm: number
    compContentPm: number
    simContentPm: number
    simTastePm: number
    simQualityPm: number
  }
  active: RecoRunRow | null
  runs: RecoRunRow[]
  demoRatingCount: number
}

const runSelect = {
  id: true,
  version: true,
  status: true,
  trainedAt: true,
  rmse: true,
  hitRate5Complement: true,
  hitRate5Similar: true,
  coverage: true,
  ratingCount: true,
  itemCount: true,
  gateReason: true,
  startedBy: { select: { displayName: true, email: true } },
} as const

type RunRecord = {
  id: string
  version: number
  status: string
  trainedAt: Date | null
  rmse: number | null
  hitRate5Complement: number | null
  hitRate5Similar: number | null
  coverage: number | null
  ratingCount: number
  itemCount: number
  gateReason: string | null
  startedBy: { displayName: string | null; email: string } | null
}

function toRow(r: RunRecord): RecoRunRow {
  return {
    ...r,
    trainedAt: r.trainedAt?.toISOString() ?? null,
    // Runs without an admin come from `npm run reco:train` or an automatic retrain.
    startedBy: r.startedBy ? (r.startedBy.displayName ?? r.startedBy.email) : 'Script / automatic',
  }
}

export async function getRecoOverview(now = new Date()): Promise<RecoOverview> {
  const db = getDb()
  const settings = await db.recoSettings.upsert({
    where: { id: 'reco' },
    create: { id: 'reco' },
    update: {},
  })
  const [runs, demoRatingCount] = await Promise.all([
    db.recoModelRun.findMany({ orderBy: { version: 'desc' }, take: 10, select: runSelect }),
    db.demoRating.count(),
  ])
  const rows = runs.map(toRow)
  return {
    enabled: settings.enabled,
    training: Boolean(settings.trainingLockUntil && settings.trainingLockUntil > now),
    weights: {
      compCoocPm: settings.compCoocPm,
      compQualityPm: settings.compQualityPm,
      compContentPm: settings.compContentPm,
      simContentPm: settings.simContentPm,
      simTastePm: settings.simTastePm,
      simQualityPm: settings.simQualityPm,
    },
    active: rows.find((r) => r.id === settings.activeRunId) ?? null,
    runs: rows,
    demoRatingCount,
  }
}

export type InspectRow = {
  rank: number
  name: string
  score: number
  contentScore: number
  tasteScore: number
  coocScore: number
  qualityScore: number
  reasons: string[]
  /** Why the row is not shown to customers right now, or null when it is shown. */
  hiddenBecause: string | null
}

/** Stored lists of the active run for one dish, with score components (admin only). */
export async function inspectItem(
  itemId: string,
): Promise<{ complement: InspectRow[]; similar: InspectRow[] } | null> {
  const db = getDb()
  const settings = await db.recoSettings.findUnique({
    where: { id: 'reco' },
    select: { activeRunId: true },
  })
  if (!settings?.activeRunId) return null
  const recs = await db.itemRecommendation.findMany({
    where: { runId: settings.activeRunId, fromItemId: itemId },
    orderBy: [{ kind: 'asc' }, { rank: 'asc' }],
    select: {
      kind: true,
      rank: true,
      score: true,
      contentScore: true,
      tasteScore: true,
      coocScore: true,
      qualityScore: true,
      reasons: true,
      toItem: {
        select: {
          name: true,
          isAvailable: true,
          isPublished: true,
          isArchived: true,
          category: { select: { isArchived: true } },
        },
      },
    },
  })
  const rows = recs.map((r) => ({
    kind: r.kind,
    row: {
      rank: r.rank,
      name: r.toItem.name,
      score: r.score,
      contentScore: r.contentScore,
      tasteScore: r.tasteScore,
      coocScore: r.coocScore,
      qualityScore: r.qualityScore,
      reasons: r.reasons,
      hiddenBecause: r.toItem.isArchived
        ? 'Archived'
        : r.toItem.category.isArchived
          ? 'Category archived'
          : !r.toItem.isPublished
            ? 'Unpublished'
            : !r.toItem.isAvailable
              ? 'Sold out'
              : null,
    },
  }))
  return {
    complement: rows.filter((r) => r.kind === 'COMPLEMENT').map((r) => r.row),
    similar: rows.filter((r) => r.kind === 'SIMILAR').map((r) => r.row),
  }
}

/** Dish choices for the Inspect tab (all non-archived dishes, menu order). */
export async function listInspectableItems() {
  return getDb().menuItem.findMany({
    where: { isArchived: false },
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  })
}
