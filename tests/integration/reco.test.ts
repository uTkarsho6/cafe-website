import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from './helpers'

/**
 * Recommendation schema and the demo-feedback scripts, Phase R1 (TEST_PLAN §4.9).
 * Runs against the throwaway test database only (vitest.integration.config.mts).
 */

const TEST_DB = 'postgresql://zorko_test:zorko_test@127.0.0.1:54329/zorko_test'

/** Runs an npm script against the TEST database; returns exit code and combined output. */
function run(script: string, args: string[] = [], extraEnv: Record<string, string> = {}) {
  try {
    const out = execFileSync('npx', ['tsx', `prisma/${script}.ts`, ...args], {
      env: { ...process.env, DIRECT_URL: TEST_DB, DATABASE_URL: TEST_DB, ...extraEnv },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    return { code: err.status, out: `${err.stdout}${err.stderr}` }
  }
}

async function rejection(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
  } catch (e) {
    return (e as Error).message
  }
  throw new Error('expected the database to reject the write')
}

let tmp = ''
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'zorko-reco-'))
})
afterAll(async () => {
  rmSync(tmp, { recursive: true, force: true })
  // Leave the shared test database as the seed made it.
  await db().demoRating.deleteMany({})
  await db().demoVisit.deleteMany({})
  await db().recoModelRun.deleteMany({})
  await db().recoSettings.deleteMany({})
  await db().menuItem.updateMany({ data: { flavorTags: [] } })
  await db().menuCategory.updateMany({ data: { mealRole: 'MAIN' } })
})

describe('recommendation schema constraints (TC-INT-092)', () => {
  const visit = (over: Record<string, unknown> = {}) =>
    db().demoVisit.create({
      data: {
        visitNo: 900_001,
        demoUserNo: 1,
        visitedAt: new Date('2026-08-01T06:00:00Z'),
        daypart: 'LUNCH',
        pattern: 'burger-meal',
        generatorVersion: 1,
        ...over,
      },
    })

  it('rejects more than 5 flavour tags on a dish', async () => {
    const item = await db().menuItem.findFirstOrThrow()
    const msg = await rejection(() =>
      db().menuItem.update({
        where: { id: item.id },
        data: { flavorTags: ['SPICY', 'CHEESY', 'KOREAN', 'PERI_PERI', 'ITALIAN', 'MEXICAN'] },
      }),
    )
    expect(msg).toContain('MenuItem_flavor_tags_max')
  })

  it('rejects an unknown flavour tag or meal role (enum)', async () => {
    const item = await db().menuItem.findFirstOrThrow()
    await expect(
      db().$executeRawUnsafe(
        `UPDATE "MenuItem" SET "flavorTags" = ARRAY['NOT_A_TAG']::"FlavorTag"[] WHERE id = $1`,
        item.id,
      ),
    ).rejects.toThrow()
    await expect(
      db().$executeRawUnsafe(`UPDATE "MenuCategory" SET "mealRole" = 'SNACK'`),
    ).rejects.toThrow()
  })

  it('demo visits: positive numbers, non-blank pattern, always demo', async () => {
    expect(await rejection(() => visit({ demoUserNo: 0 }))).toContain('DemoVisit_numbers_positive')
    expect(await rejection(() => visit({ pattern: '  ' }))).toContain('DemoVisit_pattern_not_blank')
    expect(await rejection(() => visit({ isDemo: false }))).toContain('DemoVisit_is_demo')
  })

  it('demo ratings: 1–5, sentiment must match, unique per user and dish, always demo', async () => {
    const v = await visit()
    const item = await db().menuItem.findFirstOrThrow()
    const rating = (over: Record<string, unknown>) =>
      db().demoRating.create({
        data: {
          feedbackNo: 900_001,
          visitId: v.id,
          demoUserNo: 1,
          menuItemId: item.id,
          rating: 4,
          sentiment: 'POSITIVE',
          comment: 'Tasty.',
          ratedAt: new Date('2026-08-01T06:00:00Z'),
          ...over,
        },
      })
    expect(await rejection(() => rating({ rating: 6 }))).toContain('DemoRating_rating_range')
    expect(await rejection(() => rating({ rating: 0 }))).toContain('DemoRating_rating_range')
    expect(await rejection(() => rating({ rating: 2, sentiment: 'POSITIVE' }))).toContain(
      'DemoRating_sentiment_matches_rating',
    )
    expect(await rejection(() => rating({ comment: ' ' }))).toContain(
      'DemoRating_comment_not_blank',
    )
    expect(await rejection(() => rating({ isDemo: false }))).toContain('DemoRating_is_demo')
    await rating({})
    expect(await rejection(() => rating({ feedbackNo: 900_002 }))).toMatch(
      /Unique constraint|P2002/,
    )
    await db().demoVisit.delete({ where: { id: v.id } }) // cascades to the rating
    expect(await db().demoRating.count({ where: { feedbackNo: 900_001 } })).toBe(0)
  })

  it('model runs, lists and settings enforce their ranges', async () => {
    const weights = {
      compCoocPm: 600,
      compQualityPm: 250,
      compContentPm: 150,
      simContentPm: 500,
      simTastePm: 300,
      simQualityPm: 200,
    }
    const runData = {
      dataSource: 'DEMO_FEEDBACK' as const,
      ratingCount: 1,
      visitCount: 1,
      itemCount: 2,
      ...weights,
    }
    expect(
      await rejection(() => db().recoModelRun.create({ data: { ...runData, compCoocPm: 1001 } })),
    ).toContain('RecoModelRun_weights_range')
    expect(
      await rejection(() =>
        db().recoModelRun.create({
          data: { ...runData, simContentPm: 0, simTastePm: 0, simQualityPm: 0 },
        }),
      ),
    ).toContain('RecoModelRun_weights_nonzero')
    expect(
      await rejection(() =>
        db().recoModelRun.create({ data: { ...runData, hitRate5Similar: 1.5 } }),
      ),
    ).toContain('RecoModelRun_metrics_range')
    const run = await db().recoModelRun.create({ data: runData })
    const [a, b] = await db().menuItem.findMany({ take: 2, orderBy: { slug: 'asc' } })
    const rec = (over: Record<string, unknown>) =>
      db().itemRecommendation.create({
        data: {
          runId: run.id,
          fromItemId: a.id,
          toItemId: b.id,
          kind: 'SIMILAR',
          rank: 1,
          score: 0.5,
          contentScore: 0.5,
          tasteScore: 0.5,
          coocScore: 0,
          qualityScore: 0.5,
          ...over,
        },
      })
    expect(await rejection(() => rec({ toItemId: a.id }))).toContain('ItemRecommendation_not_self')
    expect(await rejection(() => rec({ rank: 11 }))).toContain('ItemRecommendation_rank_range')
    expect(await rejection(() => rec({ score: 1.2 }))).toContain('ItemRecommendation_scores_range')
    expect(
      await rejection(() =>
        db().itemPopularity.create({
          data: { runId: run.id, menuItemId: a.id, window: 'ALL', score: -0.1 },
        }),
      ),
    ).toContain('ItemPopularity_score_range')
    expect(await rejection(() => db().recoSettings.create({ data: { id: 'other' } }))).toContain(
      'RecoSettings_singleton',
    )
    expect(
      await rejection(() =>
        db().recoSettings.create({ data: { compCoocPm: 0, compQualityPm: 0, compContentPm: 0 } }),
      ),
    ).toContain('RecoSettings_weights_nonzero')
    const settings = await db().recoSettings.create({ data: { activeRunId: run.id } })
    expect(settings.enabled).toBe(false) // off until the team switches it on
    await db().recoModelRun.delete({ where: { id: run.id } })
    expect(
      (await db().recoSettings.findUniqueOrThrow({ where: { id: 'reco' } })).activeRunId,
    ).toBeNull()
  })
})

describe('reco:tags, reco:generate and reco:export (TC-INT-093)', () => {
  it('tags the menu create-only (admin edits are kept)', async () => {
    const edited = await db().menuItem.findFirstOrThrow({ orderBy: { slug: 'asc' } })
    await db().menuItem.update({ where: { id: edited.id }, data: { flavorTags: ['MINTY'] } })
    const r = run('reco-tags')
    expect(r.code, r.out).toBe(0)
    expect(
      (await db().menuItem.findUniqueOrThrow({ where: { id: edited.id } })).flavorTags,
    ).toEqual(['MINTY'])
    expect(
      await db().menuItem.count({ where: { NOT: { flavorTags: { isEmpty: true } } } }),
    ).toBeGreaterThan(5)
  })

  it('generates demo rows only, never touching the real Feedback table', async () => {
    const feedbackBefore = await db().feedback.count()
    const r = run('reco-generate')
    expect(r.code, r.out).toBe(0)
    const ratings = await db().demoRating.count()
    expect(ratings).toBeGreaterThan(100)
    expect(await db().demoRating.count({ where: { isDemo: false } })).toBe(0)
    expect(await db().demoVisit.count()).toBeGreaterThan(50)
    expect(await db().feedback.count()).toBe(feedbackBefore)
    expect(r.out).toContain(`${ratings} ratings`)
  })

  it('refuses to run again without --replace, and refuses production without --production', async () => {
    const before = await db().demoRating.count()
    const again = run('reco-generate')
    expect(again.code).toBe(1)
    expect(again.out).toContain('--replace')
    const prod = run('reco-generate', ['--replace'], { VERCEL_ENV: 'production' })
    expect(prod.code).toBe(1)
    expect(prod.out).toContain('--production')
    expect(run('reco-tags', [], { VERCEL_ENV: 'production' }).code).toBe(1)
    expect(await db().demoRating.count()).toBe(before)
  })

  it('--replace regenerates the same data (deterministic) and only replaces demo tables', async () => {
    const snapshot = await db().demoRating.findMany({
      orderBy: { feedbackNo: 'asc' },
      select: { feedbackNo: true, demoUserNo: true, rating: true, comment: true, menuItemId: true },
    })
    const feedbackBefore = await db().feedback.count()
    const r = run('reco-generate', ['--replace'])
    expect(r.code, r.out).toBe(0)
    const after = await db().demoRating.findMany({
      orderBy: { feedbackNo: 'asc' },
      select: { feedbackNo: true, demoUserNo: true, rating: true, comment: true, menuItemId: true },
    })
    expect(after).toEqual(snapshot)
    expect(await db().feedback.count()).toBe(feedbackBefore)
  })

  it('exports both CSVs in the team format (+ visit_id, item_slug)', async () => {
    const r = run('reco-export', ['--out', tmp])
    expect(r.code, r.out).toBe(0)
    const fb = readFileSync(join(tmp, 'demo_feedback.csv'), 'utf8').trimEnd().split('\n')
    expect(fb[0]).toBe(
      'feedback_id,user_id,visit_id,item_id,item_slug,item_name,rating,comment,sentiment,timestamp',
    )
    expect(fb).toHaveLength((await db().demoRating.count()) + 1)
    const menu = readFileSync(join(tmp, 'menu_items.csv'), 'utf8').trimEnd().split('\n')
    expect(menu[0]).toMatch(/^item_id,item_slug,item_name,category,meal_role,/)
    expect(menu.length - 1).toBe(
      await db().menuItem.count({
        where: { isPublished: true, isArchived: false, category: { isArchived: false } },
      }),
    )
  })
})
