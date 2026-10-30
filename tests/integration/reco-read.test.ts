import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { FLAVOR_TAG_KEYS, FLAVOR_TAGS, suggestQuerySchema } from '@/lib/validation/reco'
import { activateRun, trainAndActivate } from '@/server/reco/train'
import {
  getItemRecommendations,
  getSuggestions,
  SECTION_SIZE,
} from '@/server/services/recommendations'
import { db } from './helpers'

/**
 * Recommendation training, read path and APIs on Postgres, Phase R3:
 * TC-INT-094…098, TC-SEC-131/132. Uses the throwaway test database and its demo menu.
 */

// The rate limiter reads the client IP from request headers; tests choose the IP per call.
let currentIp = '203.0.113.10'
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': currentIp }),
}))

const TEST_DB = 'postgresql://zorko_test:zorko_test@127.0.0.1:54329/zorko_test'
const run = (script: string, args: string[] = []) =>
  execFileSync('npx', ['tsx', `prisma/${script}.ts`, ...args], {
    env: { ...process.env, DIRECT_URL: TEST_DB, DATABASE_URL: TEST_DB },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const ROLES: Record<string, 'MAIN' | 'SIDE' | 'DRINK' | 'DESSERT'> = {
  beverages: 'DRINK',
  desserts: 'DESSERT',
  snacks: 'SIDE',
}

async function enable(on: boolean) {
  await db().recoSettings.update({ where: { id: 'reco' }, data: { enabled: on } })
}

beforeAll(async () => {
  for (const [slug, mealRole] of Object.entries(ROLES))
    await db().menuCategory.updateMany({ where: { slug }, data: { mealRole } })
  run('reco-tags')
  run('reco-generate', ['--replace'])
}, 120_000)

afterAll(async () => {
  await db().recoSettings.deleteMany({})
  await db().recoModelRun.deleteMany({})
  await db().demoRating.deleteMany({})
  await db().demoVisit.deleteMany({})
  await db().rateLimitBucket.deleteMany({})
  await db().menuItem.updateMany({ data: { flavorTags: [] } })
  await db().menuCategory.updateMany({ data: { mealRole: 'MAIN' } })
})

describe('training pipeline (TC-INT-094/095/096)', () => {
  it('trains, stores top lists for every public dish and activates the run', async () => {
    const r = await trainAndActivate(db())
    expect(r.status).toBe('ACTIVE')
    const settings = await db().recoSettings.findUniqueOrThrow({ where: { id: 'reco' } })
    expect(settings.activeRunId).toBe(r.status === 'ACTIVE' ? r.runId : null)
    expect(settings.trainingLockUntil).toBeNull()
    const publicItems = await db().menuItem.count({
      where: { isPublished: true, isArchived: false, category: { isArchived: false } },
    })
    const sources = await db().itemRecommendation.groupBy({
      by: ['fromItemId'],
      where: { runId: settings.activeRunId! },
    })
    expect(sources.length).toBe(publicItems)
    expect(await db().itemPopularity.count({ where: { runId: settings.activeRunId! } })).toBe(
      publicItems * 4,
    )
    const run = await db().recoModelRun.findUniqueOrThrow({ where: { id: settings.activeRunId! } })
    expect(run.dataSource).toBe('DEMO_FEEDBACK')
    expect(run.ratingCount).toBe(await db().demoRating.count())
    expect(run.hitRate5Complement).not.toBeNull()
  })

  it('training reads only demo ratings: real feedback rows do not change the data used (TC-INT-095)', async () => {
    await db().feedback.create({
      data: { message: 'Test reco: the pizza was amazing', status: 'APPROVED' },
    })
    const r = await trainAndActivate(db())
    expect(r.status).toBe('ACTIVE')
    const latest = await db().recoModelRun.findFirstOrThrow({ orderBy: { version: 'desc' } })
    expect(latest.ratingCount).toBe(await db().demoRating.count())
    await db().feedback.deleteMany({ where: { message: { startsWith: 'Test reco:' } } })
  })

  it('a run worse than the active one is REJECTED and the active run stays', async () => {
    const before = await db().recoSettings.findUniqueOrThrow({ where: { id: 'reco' } })
    await db().recoModelRun.update({
      where: { id: before.activeRunId! },
      data: { hitRate5Complement: 1, hitRate5Similar: 1 }, // an unbeatable active run
    })
    const r = await trainAndActivate(db())
    expect(r.status).toBe('REJECTED')
    if (r.status === 'REJECTED') expect(r.reason).toMatch(/below the active run/)
    expect((await db().recoSettings.findUniqueOrThrow({ where: { id: 'reco' } })).activeRunId).toBe(
      before.activeRunId,
    )
  })

  it('rollback: an earlier archived run can be activated again', async () => {
    const archived = await db().recoModelRun.findFirstOrThrow({
      where: { status: 'ARCHIVED' },
      orderBy: { version: 'asc' },
    })
    await activateRun(db(), archived.id)
    const s = await db().recoSettings.findUniqueOrThrow({ where: { id: 'reco' } })
    expect(s.activeRunId).toBe(archived.id)
    expect(await db().recoModelRun.count({ where: { status: 'ACTIVE' } })).toBe(1)
    const rejected = await db().recoModelRun.findFirstOrThrow({ where: { status: 'REJECTED' } })
    await expect(activateRun(db(), rejected.id)).rejects.toThrow()
  })

  it('two retrains at once: one runs, the other is queued and runs once afterwards (TC-INT-096)', async () => {
    // Reset the gate reference so new runs can activate.
    await db().recoModelRun.updateMany({ data: { hitRate5Complement: 0, hitRate5Similar: 0 } })
    const before = await db().recoModelRun.count()
    const results = await Promise.all([trainAndActivate(db()), trainAndActivate(db())])
    const statuses = results.map((r) => r.status).sort()
    expect(statuses).toContain('QUEUED')
    expect(await db().recoModelRun.count()).toBe(before + 2) // the first run + exactly one re-run
    const s = await db().recoSettings.findUniqueOrThrow({ where: { id: 'reco' } })
    expect(s.trainingLockUntil).toBeNull()
    expect(s.retrainPending).toBe(false)
  })
})

describe('item page read path (TC-INT-097)', () => {
  it('switched off: only café-curated links, exactly as before', async () => {
    await enable(false)
    const r = (await getItemRecommendations('classic-veg-burger'))!
    for (const c of [...r.goesWellWith, ...r.youMayAlsoLike])
      expect(c.reasons[0].code).toBe('ADMIN_PICK')
    expect(r.goesWellWith.map((c) => c.slug)).toEqual(expect.arrayContaining(['french-fries']))
  })

  it('switched on: curated first, then the model, at most 4 each, never itself, only available public dishes', async () => {
    await enable(true)
    const r = (await getItemRecommendations('classic-veg-burger'))!
    expect(r.goesWellWith[0].reasons[0].code).toBe('ADMIN_PICK')
    expect(r.goesWellWith.length).toBe(SECTION_SIZE)
    expect(r.youMayAlsoLike.length).toBeGreaterThan(0)
    const all = [...r.goesWellWith, ...r.youMayAlsoLike]
    expect(all.map((c) => c.slug)).not.toContain('classic-veg-burger')
    expect(new Set(all.map((c) => c.slug)).size).toBe(all.length)
    for (const c of all) expect(c.isAvailable).toBe(true)
  })

  it('a dish marked sold out disappears from suggestions at once (no retraining)', async () => {
    const r1 = (await getItemRecommendations('margherita-pizza'))!
    const victim =
      r1.goesWellWith.find((c) => c.reasons[0]?.code !== 'ADMIN_PICK') ?? r1.goesWellWith[0]
    await db().menuItem.update({ where: { slug: victim.slug }, data: { isAvailable: false } })
    try {
      const r2 = (await getItemRecommendations('margherita-pizza'))!
      expect([...r2.goesWellWith, ...r2.youMayAlsoLike].map((c) => c.slug)).not.toContain(
        victim.slug,
      )
      expect(r2.goesWellWith.length).toBe(SECTION_SIZE) // refilled from the stored top 10 / fallback
    } finally {
      await db().menuItem.update({ where: { slug: victim.slug }, data: { isAvailable: true } })
    }
  })

  it('reason labels are true: roles differ, tags shared, category equal; no numbers', async () => {
    const items = await db().menuItem.findMany({
      where: { isPublished: true, isArchived: false, category: { isArchived: false } },
      select: {
        slug: true,
        flavorTags: true,
        category: { select: { slug: true, name: true, mealRole: true } },
      },
    })
    const by = new Map(items.map((i) => [i.slug, i]))
    const labelOf: Record<string, string> = {
      SPICY: 'spicy',
      CHEESY: 'cheesy',
      KOREAN: 'Korean',
      PERI_PERI: 'Peri Peri',
      ITALIAN: 'Italian',
      MEXICAN: 'Mexican',
      SMOKY: 'barbeque',
      PANEER: 'paneer',
      CREAMY: 'creamy',
      FRUITY: 'fruity',
      CHOCOLATE: 'chocolate',
      COFFEE: 'coffee',
      MINTY: 'minty',
    }
    for (const src of items) {
      const r = (await getItemRecommendations(src.slug))!
      for (const [list, cards] of [
        ['gww', r.goesWellWith],
        ['ymal', r.youMayAlsoLike],
      ] as const)
        for (const c of cards) {
          const to = by.get(c.slug)!
          expect(c.reasons.length).toBeLessThanOrEqual(2)
          for (const reason of c.reasons) {
            expect(reason.label).not.toMatch(/\d|rated|people|customers|guests|ordered|%/i)
            if (reason.code === 'PAIRS_WITH_ROLE')
              expect(to.category.mealRole).not.toBe(src.category.mealRole)
            if (reason.code === 'SAME_CATEGORY') expect(to.category.slug).toBe(src.category.slug)
            if (reason.code === 'BEST_SELLER') expect(c.isBestSeller).toBe(true)
            if (reason.code === 'SHARED_TAGS')
              for (const word of reason.label.replace(/^Also /, '').split(' & ')) {
                const tag = Object.keys(labelOf).find((k) => labelOf[k] === word)!
                expect(src.flavorTags, `${src.slug} → ${c.slug} (${list})`).toContain(tag)
                expect(to.flavorTags).toContain(tag)
              }
          }
        }
    }
  })

  it('unknown, unpublished or archived dishes give null', async () => {
    expect(await getItemRecommendations('no-such-dish')).toBeNull()
    const hidden = await db().menuItem.findFirstOrThrow({ where: { isPublished: true } })
    await db().menuItem.update({ where: { id: hidden.id }, data: { isPublished: false } })
    try {
      expect(await getItemRecommendations(hidden.slug)).toBeNull()
    } finally {
      await db().menuItem.update({ where: { id: hidden.id }, data: { isPublished: true } })
    }
  })
})

describe('Help me choose (FR-065)', () => {
  const ask = (q: Record<string, string>) => getSuggestions(suggestQuerySchema.parse(q))

  it('mood decides the meal role; at most 5, at most 2 per category, only available dishes', async () => {
    const roles = new Map(
      (
        await db().menuItem.findMany({
          select: { slug: true, category: { select: { mealRole: true } } },
        })
      ).map((i) => [i.slug, i.category.mealRole]),
    )
    for (const [mood, role] of [
      ['meal', 'MAIN'],
      ['snack', 'SIDE'],
      ['drink', 'DRINK'],
    ] as const) {
      const s = await ask({ mood })
      expect(s.length).toBeGreaterThan(0)
      expect(s.length).toBeLessThanOrEqual(5)
      for (const x of s) {
        expect(roles.get(x.item.slug)).toBe(role)
        expect(x.item.isAvailable).toBe(true)
      }
      const cats = s.map((x) => x.item.category.slug)
      for (const c of new Set(cats))
        expect(cats.filter((y) => y === c).length).toBeLessThanOrEqual(2)
    }
  })

  it('budget bands are respected for dishes and for meal pairings', async () => {
    for (const x of await ask({ mood: 'meal', budget: 'under-100' }))
      expect(x.item.pricePaise).toBeLessThan(10_000)
    for (const x of await ask({ mood: 'meal', budget: '100-200' })) {
      expect(x.item.pricePaise).toBeGreaterThanOrEqual(10_000)
      expect(x.item.pricePaise).toBeLessThanOrEqual(20_000)
      if (x.pairTotalPaise !== null) expect(x.pairTotalPaise).toBeLessThanOrEqual(20_000)
    }
    const any = await ask({ mood: 'meal' })
    expect(any.some((x) => x.pairWith !== null)).toBe(true)
    for (const x of any)
      if (x.pairWith) expect(x.pairTotalPaise).toBe(x.item.pricePaise + x.pairWith.pricePaise)
  })

  it('chosen flavours rank matching dishes first and the reason names them', async () => {
    const tagged = await db().menuItem.findFirst({
      where: {
        NOT: { flavorTags: { isEmpty: true } },
        isAvailable: true,
        category: { mealRole: 'MAIN' },
      },
      select: { flavorTags: true },
    })
    if (!tagged) return
    const s = await ask({ mood: 'meal', tags: tagged.flavorTags[0] })
    expect(s[0].item.reasons[0].code).toBe('SHARED_TAGS')
    // Every matching dish is listed before any non-matching dish.
    const matches = s.map((x) => x.item.reasons.some((r) => r.code === 'SHARED_TAGS'))
    expect(matches).toEqual([...matches].sort((a, b) => Number(b) - Number(a)))
  })

  it('regression (R5b): every dish has a chosen flavour; a flavour no meal has gives no results', async () => {
    const mains = await db().menuItem.findMany({
      where: { isAvailable: true, isPublished: true, category: { mealRole: 'MAIN' } },
      select: { flavorTags: true },
    })
    const present = new Set(mains.flatMap((m) => m.flavorTags))
    for (const tag of present)
      for (const x of await ask({ mood: 'meal', tags: tag }))
        expect(x.flavours, `${tag}: ${x.item.name}`).toContain(FLAVOR_TAGS[tag])
    const absent = FLAVOR_TAG_KEYS.find((t) => !present.has(t))
    expect(absent).toBeDefined() // the test menu has no minty-style main
    expect(await ask({ mood: 'meal', tags: absent! })).toEqual([])
    // Several flavours: at least one of them on every dish.
    const two = [...present].slice(0, 2)
    for (const x of await ask({ mood: 'meal', tags: two.join(',') }))
      expect(two.some((t) => x.flavours.includes(FLAVOR_TAGS[t]))).toBe(true)
  })
})

describe('recommendation APIs (TC-INT-098, TC-SEC-131/132)', async () => {
  const { GET: itemGET } = await import('@/app/api/v1/menu/[slug]/recommendations/route')
  const { GET: suggestGET } = await import('@/app/api/v1/recommendations/suggest/route')
  const call = async (
    handler: (req: Request, ctx: never) => Promise<Response>,
    path: string,
    slug?: string,
  ) => {
    const res = await handler(new Request(`http://localhost:3000${path}`), {
      params: Promise.resolve({ slug }),
    } as never)
    return { status: res.status, body: await res.json(), headers: res.headers }
  }
  const reason = z.object({ code: z.string(), label: z.string() }).strict()
  const card = z
    .object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      description: z.string(),
      pricePaise: z.number().int(),
      priceLabel: z.string(),
      dietType: z.string(),
      isAvailable: z.boolean(),
      isBestSeller: z.boolean(),
      isTrending: z.boolean(),
      isFeatured: z.boolean(),
      hasActiveOffer: z.boolean(),
      category: z.object({ slug: z.string(), name: z.string() }).strict(),
      image: z.object({ url: z.string(), altText: z.string() }).strict().nullable(),
      reasons: z.array(reason).max(2),
    })
    .strict()

  it('item recommendations: exact public shape, no scores/ratings/run ids', async () => {
    currentIp = '203.0.113.20'
    const r = await call(
      itemGET,
      '/api/v1/menu/classic-veg-burger/recommendations',
      'classic-veg-burger',
    )
    expect(r.status).toBe(200)
    z.object({
      data: z
        .object({ goesWellWith: z.array(card).max(4), youMayAlsoLike: z.array(card).max(4) })
        .strict(),
    })
      .strict()
      .parse(r.body)
    expect(JSON.stringify(r.body)).not.toMatch(
      /"(score|rating|runId|tasteScore|coocScore|flavorTags|isDemo)"/,
    )
    expect(r.headers.get('cache-control')).toBe('no-store')
  })

  it('suggestions: exact public shape', async () => {
    const r = await call(
      suggestGET,
      '/api/v1/recommendations/suggest?mood=meal&budget=any&tags=CHEESY,SPICY',
    )
    expect(r.status).toBe(200)
    z.object({
      data: z
        .object({
          suggestions: z
            .array(
              z
                .object({
                  item: card,
                  flavours: z.array(z.string()).max(5),
                  pairWith: card.nullable(),
                  pairTotalPaise: z.number().int().nullable(),
                  pairTotalLabel: z.string().nullable(),
                })
                .strict(),
            )
            .max(5),
        })
        .strict(),
    })
      .strict()
      .parse(r.body)
  })

  it('400 for invalid input, including injection-style values; 404 for unknown dishes (TC-SEC-131)', async () => {
    for (const q of [
      'mood=evil',
      'mood=meal&budget=1e9',
      'mood=meal&tags=SPICY,CHEESY,KOREAN,MINTY',
      "mood=meal&tags=SPICY'%20OR%201=1--",
      'mood=meal&tags=' + 'SPICY,'.repeat(20),
      'budget=any',
    ]) {
      const r = await call(suggestGET, `/api/v1/recommendations/suggest?${q}`)
      expect(r.status, q).toBe(400)
      expect(r.body.error.code).toBe('VALIDATION_ERROR')
      expect(JSON.stringify(r.body)).not.toMatch(/prisma|stack|select|postgres/i)
    }
    expect(
      (await call(itemGET, '/api/v1/menu/x/recommendations', "x'; DROP TABLE x;--")).status,
    ).toBe(400)
    expect(
      (await call(itemGET, '/api/v1/menu/no-such-dish/recommendations', 'no-such-dish')).status,
    ).toBe(404)
    const ok = await call(suggestGET, '/api/v1/recommendations/suggest?mood=drink&unknown=1')
    expect(ok.status).toBe(200) // unknown params are ignored
  })

  it('rate limit: the 61st request in a minute from one IP gets 429 with Retry-After (TC-SEC-132)', async () => {
    currentIp = '203.0.113.99'
    await db().rateLimitBucket.deleteMany({})
    let last = 0
    let headers: Headers | null = null
    for (let i = 0; i < 61; i++) {
      const r = await call(suggestGET, '/api/v1/recommendations/suggest?mood=drink')
      last = r.status
      headers = r.headers
    }
    expect(last).toBe(429)
    expect(Number(headers!.get('retry-after'))).toBeGreaterThan(0)
    currentIp = '203.0.113.100' // another guest is not affected
    expect((await call(suggestGET, '/api/v1/recommendations/suggest?mood=drink')).status).toBe(200)
  })
})
