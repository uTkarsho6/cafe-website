import type { PrismaClient } from '../../generated/prisma/client'
import type { RecoReason } from '../../generated/prisma/enums'
import {
  coverage,
  daypartAt,
  DEFAULT_WEIGHTS_PM,
  evalComplement,
  evalSimilar,
  popularityRecommender,
  ratingErrors,
  splitByVisit,
  top,
  train,
  WINDOWS,
  type EngineItem,
  type EngineRating,
  type ListEntry,
  type ListKind,
  type Model,
  type WeightsPm,
} from '../../lib/reco/engine'

/**
 * Training pipeline (RECOMMENDATION §5, FR-062). Used by `npm run reco:train`, and in R5 by the admin
 * "Retrain" action and automatic retraining. Takes the Prisma client as a parameter and has no
 * `server-only` import, so the CLI script can use it; it is never imported by client code.
 *
 * Flow: lock → load menu + demo ratings → 80/20 split → fit on 80 % → evaluate → quality gate →
 * (pass) refit on 100 % → write run + lists + popularity and activate in ONE transaction →
 * unlock → run once more if a retrain was requested meanwhile.
 */

export const LOCK_MS = 2 * 60_000
/**
 * A new run is rejected only when it is clearly worse than the reference (the active run, or
 * popularity for the first run): by more than max(0.02, 2 standard errors of the reference hit
 * rate at this sample size). A fixed margin rejected good runs by chance on small held-out sets
 * (ADR-074).
 */
export const GATE_TOLERANCE = 0.02
export function gateMargin(reference: number, n: number): number {
  const se = n > 0 ? Math.sqrt((reference * (1 - reference)) / n) : 1
  return Math.max(GATE_TOLERANCE, 2 * se)
}
export const KEEP_RUNS = 10

export type TrainResult =
  | { status: 'QUEUED' }
  | {
      status: 'ACTIVE' | 'REJECTED' | 'FAILED'
      runId: string
      version: number
      reason: string | null
      metrics: RunMetrics | null
    }

export type RunMetrics = {
  hitRate5Complement: number
  hitRate5Similar: number
  precision5: number
  recall5: number
  coverage: number
  rmse: number
  mae: number
  baselineHitRate5: number
  baselineSimilar: number
  complementQueries: number
  similarPairs: number
}

export type TrainOptions = {
  startedById?: string | null
  now?: Date
  /** Called after a successful activation (the app passes a cache-tag expiry here). */
  onActivated?: () => void | Promise<void>
}

// ---------------------------------------------------------------- data

export async function loadTrainingData(db: PrismaClient): Promise<{
  items: EngineItem[]
  ratings: EngineRating[]
  ids: Map<string, string>
}> {
  const rows = await db.menuItem.findMany({
    where: { isPublished: true, isArchived: false, category: { isArchived: false } },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      pricePaise: true,
      flavorTags: true,
      isBestSeller: true,
      isTrending: true,
      category: { select: { slug: true, mealRole: true } },
    },
  })
  const items: EngineItem[] = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    description: r.description,
    category: r.category.slug,
    mealRole: r.category.mealRole,
    pricePaise: r.pricePaise,
    flavorTags: r.flavorTags,
    isBestSeller: r.isBestSeller,
    isTrending: r.isTrending,
  }))
  const ids = new Map(rows.map((r) => [r.slug, r.id]))
  const demo = await db.demoRating.findMany({
    where: { menuItemId: { in: rows.map((r) => r.id) } },
    select: {
      demoUserNo: true,
      rating: true,
      ratedAt: true,
      visit: { select: { visitNo: true } },
      menuItem: { select: { slug: true } },
    },
  })
  const ratings: EngineRating[] = demo.map((d) => ({
    userNo: d.demoUserNo,
    visitNo: d.visit.visitNo,
    slug: d.menuItem.slug,
    rating: d.rating,
    daypart: daypartAt(d.ratedAt),
  }))
  return { items, ratings, ids }
}

// ---------------------------------------------------------------- reasons stored with each entry

/** Structural reason codes (RECOMMENDATION §6); labels are built from live data when shown. */
export function reasonsFor(kind: ListKind, from: EngineItem, to: EngineItem): RecoReason[] {
  const shared = from.flavorTags.some((t) => to.flavorTags.includes(t))
  if (kind === 'COMPLEMENT')
    return shared ? ['PAIRS_WITH_ROLE', 'SHARED_TAGS'] : ['PAIRS_WITH_ROLE']
  if (shared) return ['SHARED_TAGS']
  return from.category === to.category ? ['SAME_CATEGORY'] : []
}

// ---------------------------------------------------------------- settings and lock

async function settingsRow(db: PrismaClient) {
  return db.recoSettings.upsert({ where: { id: 'reco' }, create: { id: 'reco' }, update: {} })
}

export async function acquireLock(db: PrismaClient, now: Date): Promise<boolean> {
  await settingsRow(db)
  // Conditional update = an atomic "take the lock if free or expired" (no raw SQL needed).
  const taken = await db.recoSettings.updateMany({
    where: { id: 'reco', OR: [{ trainingLockUntil: null }, { trainingLockUntil: { lt: now } }] },
    data: { trainingLockUntil: new Date(now.getTime() + LOCK_MS), retrainPending: false },
  })
  if (taken.count === 1) return true
  await db.recoSettings.update({ where: { id: 'reco' }, data: { retrainPending: true } })
  return false
}

/** Releases the lock; returns whether another retrain was requested while it was held. */
export async function releaseLock(db: PrismaClient): Promise<boolean> {
  const before = await db.recoSettings.findUnique({
    where: { id: 'reco' },
    select: { retrainPending: true },
  })
  await db.recoSettings.update({
    where: { id: 'reco' },
    data: { trainingLockUntil: null, retrainPending: false },
  })
  return before?.retrainPending ?? false
}

const weightsOf = (s: WeightsPm): WeightsPm => ({
  compCoocPm: s.compCoocPm,
  compQualityPm: s.compQualityPm,
  compContentPm: s.compContentPm,
  simContentPm: s.simContentPm,
  simTastePm: s.simTastePm,
  simQualityPm: s.simQualityPm,
})

// ---------------------------------------------------------------- one training run

function evaluate(items: EngineItem[], ratings: EngineRating[], weights: WeightsPm): RunMetrics {
  const { train: trainSet, test } = splitByVisit(ratings)
  const m = train(items, trainSet, weights)
  const roles = new Map(items.map((i) => [i.slug, i.mealRole]))
  const comp = evalComplement((s) => top(m, s, 'COMPLEMENT', 10), test)
  const sim = evalSimilar((s) => top(m, s, 'SIMILAR', 10), trainSet, test, roles)
  const err = ratingErrors(m, trainSet, test)
  return {
    hitRate5Complement: comp.hitRate,
    hitRate5Similar: sim.hitRate,
    precision5: comp.precision,
    recall5: comp.recall,
    coverage: coverage(m),
    rmse: err.rmse,
    mae: err.mae,
    baselineHitRate5: evalComplement(popularityRecommender(m, 'COMPLEMENT'), test).hitRate,
    baselineSimilar: evalSimilar(popularityRecommender(m, 'SIMILAR'), trainSet, test, roles)
      .hitRate,
    complementQueries: comp.queries,
    similarPairs: sim.pairs,
  }
}

/** Gate (§5): not worse than the active run, or for the first run not worse than popularity. */
export function gate(
  m: RunMetrics,
  active: { hitRate5Complement: number | null; hitRate5Similar: number | null } | null,
): string | null {
  if (m.complementQueries === 0 || m.similarPairs === 0)
    return 'Not enough held-out feedback to evaluate.'
  const refComp = active?.hitRate5Complement ?? m.baselineHitRate5
  const refSim = active?.hitRate5Similar ?? m.baselineSimilar
  const against = active ? 'the active run' : 'popularity'
  if (m.hitRate5Complement < refComp - gateMargin(refComp, m.complementQueries))
    return `"Goes well with" HitRate@5 ${m.hitRate5Complement.toFixed(3)} is below ${against} (${refComp.toFixed(3)}).`
  if (m.hitRate5Similar < refSim - gateMargin(refSim, m.similarPairs))
    return `"You may also like" HitRate@5 ${m.hitRate5Similar.toFixed(3)} is below ${against} (${refSim.toFixed(3)}).`
  return null
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

function listRows(model: Model, runId: string, ids: Map<string, string>) {
  const bySlug = new Map(model.items.map((i) => [i.slug, i]))
  const rows = []
  for (const slug of model.slugs)
    for (const kind of ['COMPLEMENT', 'SIMILAR'] as const)
      for (const e of model.lists[slug][kind] as ListEntry[])
        rows.push({
          runId,
          fromItemId: ids.get(slug)!,
          toItemId: ids.get(e.slug)!,
          kind,
          rank: e.rank,
          score: clamp01(e.score),
          contentScore: clamp01(e.content),
          tasteScore: clamp01(e.taste),
          coocScore: clamp01(e.cooc),
          qualityScore: clamp01(e.quality),
          reasons: reasonsFor(kind, bySlug.get(slug)!, bySlug.get(e.slug)!),
        })
  return rows
}

export async function trainOnce(db: PrismaClient, opts: TrainOptions = {}): Promise<TrainResult> {
  const started = Date.now()
  const settings = await settingsRow(db)
  const weights = weightsOf(settings)
  const { items, ratings, ids } = await loadTrainingData(db)
  const visitCount = new Set(ratings.map((r) => r.visitNo)).size
  const run = await db.recoModelRun.create({
    data: {
      dataSource: 'DEMO_FEEDBACK',
      ...weights,
      ratingCount: ratings.length,
      visitCount,
      itemCount: items.length,
      startedById: opts.startedById ?? null,
    },
    select: { id: true, version: true },
  })
  try {
    const metrics = evaluate(items, ratings, weights)
    const active = settings.activeRunId
      ? await db.recoModelRun.findUnique({
          where: { id: settings.activeRunId },
          select: { hitRate5Complement: true, hitRate5Similar: true },
        })
      : null
    const metricColumns = {
      rmse: metrics.rmse,
      mae: metrics.mae,
      hitRate5Complement: metrics.hitRate5Complement,
      hitRate5Similar: metrics.hitRate5Similar,
      precision5: metrics.precision5,
      recall5: metrics.recall5,
      coverage: metrics.coverage,
      baselineHitRate5: metrics.baselineHitRate5,
    }
    const reason = gate(metrics, active)
    if (reason) {
      await db.recoModelRun.update({
        where: { id: run.id },
        data: {
          status: 'REJECTED',
          gateReason: reason,
          ...metricColumns,
          durationMs: Date.now() - started,
        },
      })
      return { status: 'REJECTED', runId: run.id, version: run.version, reason, metrics }
    }

    const final = train(items, ratings, weights)
    const now = opts.now ?? new Date()
    const popularity = final.slugs.flatMap((slug, k) =>
      WINDOWS.map((window) => ({
        runId: run.id,
        menuItemId: ids.get(slug)!,
        window,
        score: clamp01(final.quality[window][k]),
      })),
    )
    await db.$transaction(
      async (tx) => {
        await tx.itemRecommendation.createMany({ data: listRows(final, run.id, ids) })
        await tx.itemPopularity.createMany({ data: popularity })
        await tx.recoModelRun.updateMany({
          where: { status: 'ACTIVE' },
          data: { status: 'ARCHIVED' },
        })
        await tx.recoModelRun.update({
          where: { id: run.id },
          data: {
            status: 'ACTIVE',
            ...metricColumns,
            trainedAt: now,
            activatedAt: now,
            durationMs: Date.now() - started,
          },
        })
        await tx.recoSettings.update({ where: { id: 'reco' }, data: { activeRunId: run.id } })
      },
      { timeout: 60_000 },
    )
    await pruneRuns(db)
    await opts.onActivated?.()
    return { status: 'ACTIVE', runId: run.id, version: run.version, reason: null, metrics }
  } catch (err) {
    await db.recoModelRun
      .update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          gateReason: 'Training failed (see server logs).',
          durationMs: Date.now() - started,
        },
      })
      .catch(() => {})
    throw err
  }
}

/** Keeps the latest KEEP_RUNS runs (and always the active one); older rows cascade away. */
export async function pruneRuns(db: PrismaClient): Promise<number> {
  const keep = await db.recoModelRun.findMany({
    orderBy: { version: 'desc' },
    take: KEEP_RUNS,
    select: { id: true },
  })
  const removed = await db.recoModelRun.deleteMany({
    where: { id: { notIn: keep.map((r) => r.id) }, status: { not: 'ACTIVE' } },
  })
  return removed.count
}

/**
 * Locked training with coalescing (FR-068): if a run is in progress, the request is queued
 * (`retrainPending`) and the running job trains once more when it finishes.
 */
export async function trainAndActivate(
  db: PrismaClient,
  opts: TrainOptions = {},
): Promise<TrainResult> {
  const now = opts.now ?? new Date()
  if (!(await acquireLock(db, now))) return { status: 'QUEUED' }
  let result: TrainResult
  try {
    result = await trainOnce(db, opts)
    if (await releaseLock(db)) {
      if (await acquireLock(db, new Date())) {
        try {
          result = await trainOnce(db, opts)
        } finally {
          await releaseLock(db)
        }
      }
    }
    return result
  } catch (err) {
    await releaseLock(db).catch(() => {})
    throw err
  }
}

/** Re-activates an earlier ACTIVE/ARCHIVED run (rollback, R5 admin). Atomic. */
export async function activateRun(
  db: PrismaClient,
  runId: string,
  now = new Date(),
): Promise<void> {
  const run = await db.recoModelRun.findUnique({ where: { id: runId }, select: { status: true } })
  if (!run || (run.status !== 'ARCHIVED' && run.status !== 'ACTIVE'))
    throw new Error('Only a stored (active or archived) run can be activated.')
  await settingsRow(db)
  await db.$transaction([
    db.recoModelRun.updateMany({
      where: { status: 'ACTIVE', id: { not: runId } },
      data: { status: 'ARCHIVED' },
    }),
    db.recoModelRun.update({ where: { id: runId }, data: { status: 'ACTIVE', activatedAt: now } }),
    db.recoSettings.update({ where: { id: 'reco' }, data: { activeRunId: runId } }),
  ])
}

export { DEFAULT_WEIGHTS_PM }
