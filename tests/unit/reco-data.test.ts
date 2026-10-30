// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sangliMenu, slugify } from '../../prisma/data/sangli-menu'
import { FlavorTag, MealRole } from '../../src/generated/prisma/enums'
import {
  FEEDBACK_CSV_HEADER,
  feedbackToCsv,
  generateDemoFeedback,
  istToDate,
  MAX_RATINGS_PER_USER,
  MIN_RATINGS_PER_USER,
  sentimentFor,
  toStars,
  type MenuItemInput,
} from '../../src/lib/reco/demo-feedback'
import {
  CATEGORY_MEAL_ROLES,
  mealRoleForCategory,
  suggestFlavorTags,
} from '../../src/lib/reco/tag-rules'
import {
  FLAVOR_TAG_KEYS,
  flavorTagsSchema,
  MEAL_ROLE_KEYS,
  mealRoleSchema,
} from '../../src/lib/validation/reco'

/** Recommendation data, Phase R1 (RECOMMENDATION §2–3, TEST_PLAN §4.9). No database needed. */

// The real menu exactly as the generator sees it after `reco:tags` (tags from the keyword rule).
const MENU: MenuItemInput[] = sangliMenu.flatMap((c) =>
  c.items.map((i) => ({
    slug: slugify(i.name),
    name: i.name,
    categorySlug: c.slug,
    mealRole: mealRoleForCategory(c.slug),
    pricePaise: i.price * 100,
    flavorTags: suggestFlavorTags(i.name, i.desc),
    isBestSeller: Boolean(i.tags?.includes('best')),
    isTrending: Boolean(i.tags?.includes('must')),
  })),
)
const BY_SLUG = new Map(MENU.map((i) => [i.slug, i]))
const DATA = generateDemoFeedback(MENU)
const pct = (n: number, d: number) => (100 * n) / d

describe('demo feedback generator: determinism and shape (TC-UNIT-130)', () => {
  it('gives identical output for the same menu and seed, in any input order', () => {
    const again = generateDemoFeedback([...MENU].reverse())
    expect(again.ratings).toEqual(DATA.ratings)
    expect(again.visits).toEqual(DATA.visits)
    const ids = new Map(MENU.map((i, k) => [i.slug, k + 1]))
    expect(feedbackToCsv(again, MENU, ids)).toBe(feedbackToCsv(DATA, MENU, ids))
  })

  it('a different seed gives different data', () => {
    expect(generateDemoFeedback(MENU, { seed: 7 }).ratings).not.toEqual(DATA.ratings)
  })

  it('has the planned volume: 400 users, about 1,400 visits and 2,400 ratings, all 65 dishes', () => {
    expect(new Set(DATA.ratings.map((r) => r.demoUserNo)).size).toBe(400)
    expect(DATA.visits.length).toBeGreaterThan(1200)
    expect(DATA.visits.length).toBeLessThan(1600)
    expect(DATA.ratings.length).toBeGreaterThan(2200)
    expect(DATA.ratings.length).toBeLessThan(2600)
    expect(new Set(DATA.ratings.map((r) => r.itemSlug)).size).toBe(65)
  })

  it('uses only the given dishes, with their exact names in the CSV', () => {
    for (const r of DATA.ratings) expect(BY_SLUG.has(r.itemSlug)).toBe(true)
    const ids = new Map(MENU.map((i, k) => [i.slug, k + 1]))
    const lines = feedbackToCsv(DATA, MENU, ids).trimEnd().split('\n')
    expect(lines[0]).toBe(FEEDBACK_CSV_HEADER)
    expect(lines).toHaveLength(DATA.ratings.length + 1)
    // Field-by-field check of every line (minimal CSV parser: quoted cells may contain commas).
    const parse = (line: string) =>
      [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)]
        .slice(0, 10)
        .map((m) => m[1].replace(/^"|"$/g, '').replace(/""/g, '"'))
    for (const [k, line] of lines.slice(1).entries()) {
      const [fid, uid, vid, iid, slug, name, rating, comment, sentiment, ts] = parse(line)
      const r = DATA.ratings[k]
      expect([fid, uid, vid, rating].map(Number)).toEqual([
        r.feedbackNo,
        r.demoUserNo,
        r.visitNo,
        r.rating,
      ])
      expect(Number(iid)).toBe(ids.get(r.itemSlug))
      expect([slug, name, comment]).toEqual([r.itemSlug, BY_SLUG.get(r.itemSlug)!.name, r.comment])
      expect(sentiment).toBe(r.sentiment.toLowerCase())
      expect(ts).toMatch(/^2026-\d\d-\d\d \d\d:\d\d:00$/)
    }
    const names = new Set(MENU.map((i) => i.name))
    for (const r of DATA.ratings) expect(names.has(BY_SLUG.get(r.itemSlug)!.name)).toBe(true)
  })

  it('numbers feedback and visits 1…n in time order, inside the fixed window (IST)', () => {
    expect(DATA.ratings.map((r) => r.feedbackNo)).toEqual(DATA.ratings.map((_, k) => k + 1))
    expect(DATA.visits.map((v) => v.visitNo)).toEqual(DATA.visits.map((_, k) => k + 1))
    const times = DATA.ratings.map((r) => r.ratedAtIst)
    expect([...times].sort()).toEqual(times)
    expect(times[0] >= '2026-08-01 11:00:00').toBe(true)
    expect(times.at(-1)! <= '2026-10-29 21:59:00').toBe(true)
    expect(istToDate('2026-08-01 11:00:00').toISOString()).toBe('2026-08-01T05:30:00.000Z')
  })
})

describe('demo feedback generator: rules (TC-UNIT-131)', () => {
  const visitsByNo = new Map(DATA.visits.map((v) => [v.visitNo, v]))
  const users = new Map(DATA.users!.map((u) => [u.demoUserNo, u]))
  const byVisit = new Map<number, string[]>()
  for (const r of DATA.ratings)
    byVisit.set(r.visitNo, [...(byVisit.get(r.visitNo) ?? []), r.itemSlug])

  it('every visit has 1–6 dishes and belongs to the rating user', () => {
    expect(byVisit.size).toBe(DATA.visits.length)
    for (const [no, slugs] of byVisit) {
      expect(slugs.length).toBeGreaterThanOrEqual(1)
      expect(slugs.length).toBeLessThanOrEqual(6)
      expect(visitsByNo.get(no)).toBeDefined()
    }
    for (const r of DATA.ratings) expect(visitsByNo.get(r.visitNo)!.demoUserNo).toBe(r.demoUserNo)
  })

  it("a visit fits the user's budget (+10 %), except a lone first dish when nothing cheaper exists", () => {
    let checked = 0
    for (const [no, slugs] of byVisit) {
      const user = users.get(visitsByNo.get(no)!.demoUserNo)!
      const total = slugs.reduce((s, slug) => s + BY_SLUG.get(slug)!.pricePaise, 0)
      if (slugs.length > 1) {
        expect(total).toBeLessThanOrEqual(user.budgetMaxPaise * 1.1)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(500) // most visits have 2+ dishes
  })

  it('never repeats a user–dish pair; each user rates 2–12 dishes', () => {
    const pairs = DATA.ratings.map((r) => `${r.demoUserNo}:${r.itemSlug}`)
    expect(new Set(pairs).size).toBe(pairs.length)
    const counts = new Map<number, number>()
    for (const r of DATA.ratings) counts.set(r.demoUserNo, (counts.get(r.demoUserNo) ?? 0) + 1)
    for (const n of counts.values()) {
      expect(n).toBeGreaterThanOrEqual(MIN_RATINGS_PER_USER)
      expect(n).toBeLessThanOrEqual(MAX_RATINGS_PER_USER)
    }
  })

  it('sentiment always follows the rating, like the team file', () => {
    for (const r of DATA.ratings) expect(r.sentiment).toBe(sentimentFor(r.rating))
    expect([1.49, 1.5, 3.41, 3.42, 4.52].map(toStars)).toEqual([1, 2, 3, 4, 5])
  })

  it('comments: right temperature words, no place superlatives, ≤200 characters', () => {
    for (const r of DATA.ratings) {
      const item = BY_SLUG.get(r.itemSlug)!
      const text = r.comment.replace(item.name, '')
      expect(r.comment.length).toBeLessThanOrEqual(200)
      expect(r.comment).not.toMatch(/\bbest\b.*\bin\b|sangli/i)
      const coldDrink = item.mealRole === 'DRINK' && item.categorySlug !== 'hot-beverages'
      if (coldDrink) expect(text).not.toMatch(/\bhot\b/i)
      if (item.mealRole !== 'DRINK') expect(text).not.toMatch(/chilled|refreshing/i)
    }
  })

  it('only uses dishes it is given (a removed dish never appears)', () => {
    const without = MENU.filter((i) => i.slug !== 'korean-burger')
    const d = generateDemoFeedback(without)
    expect(d.ratings.some((r) => r.itemSlug === 'korean-burger')).toBe(false)
  })
})

describe('demo feedback generator: distributions (TC-UNIT-132)', () => {
  // The team's reference file (2,386 rows), kept in the repo for exactly this comparison.
  const reference = readFileSync('data/reco/reference/feedback_team_v1.csv', 'utf8')
    .trimEnd()
    .split('\n')
    .slice(1)
    .map((l) => Number(l.match(/,([1-5]),(?:"[^"]*"|[^,]*),(positive|neutral|negative),/)![1]))

  it('star mix is within ±3 points of the team file', () => {
    expect(reference).toHaveLength(2386)
    for (const stars of [1, 2, 3, 4, 5]) {
      const ours = pct(DATA.ratings.filter((r) => r.rating === stars).length, DATA.ratings.length)
      const theirs = pct(reference.filter((r) => r === stars).length, reference.length)
      expect(
        Math.abs(ours - theirs),
        `${stars}★ ours ${ours.toFixed(1)} vs ${theirs.toFixed(1)}`,
      ).toBeLessThanOrEqual(3)
    }
  })

  it('daypart shares are within ±3 points of 35/30/35 % and every pattern is used', () => {
    const share = (d: string) =>
      pct(DATA.visits.filter((v) => v.daypart === d).length, DATA.visits.length)
    expect(Math.abs(share('LUNCH') - 35)).toBeLessThanOrEqual(3)
    expect(Math.abs(share('AFTERNOON') - 30)).toBeLessThanOrEqual(3)
    expect(Math.abs(share('EVENING') - 35)).toBeLessThanOrEqual(3)
    expect(new Set(DATA.visits.map((v) => v.pattern)).size).toBe(11)
  })

  it('taste profiles show in the data: liked dishes are rated higher than disliked ones', () => {
    const users = new Map(DATA.users!.map((u) => [u.demoUserNo, u]))
    const liked: number[] = []
    const disliked: number[] = []
    for (const r of DATA.ratings) {
      const u = users.get(r.demoUserNo)!
      const tags = BY_SLUG.get(r.itemSlug)!.flavorTags
      if (u.dislikedTag && tags.includes(u.dislikedTag)) disliked.push(r.rating)
      else if (tags.some((t) => u.likedTags.includes(t))) liked.push(r.rating)
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(mean(liked) - mean(disliked)).toBeGreaterThan(1)
  })
})

describe('initial flavour tags and meal roles on the real menu (TC-UNIT-133)', () => {
  it('maps all 16 real categories to a meal role', () => {
    expect(sangliMenu.map((c) => c.slug).every((s) => s in CATEGORY_MEAL_ROLES)).toBe(true)
    expect(mealRoleForCategory('fries')).toBe('SIDE')
    expect(mealRoleForCategory('mojito')).toBe('DRINK')
    expect(mealRoleForCategory('maggi')).toBe('MAIN')
    expect(mealRoleForCategory('a-new-admin-category')).toBe('MAIN')
  })

  it('tags follow the names: Korean, Peri Peri, Paneer, Coffee; at most 5; canonical order', () => {
    for (const i of MENU) {
      expect(i.flavorTags.length).toBeLessThanOrEqual(5)
      expect(i.flavorTags).toEqual(FLAVOR_TAG_KEYS.filter((k) => i.flavorTags.includes(k)))
      if (/korean/i.test(i.name)) expect(i.flavorTags).toContain('KOREAN')
      if (/peri peri/i.test(i.name)) expect(i.flavorTags).toContain('PERI_PERI')
      if (/paneer/i.test(i.name)) expect(i.flavorTags).toContain('PANEER')
      if (/coffee/i.test(i.name)) expect(i.flavorTags).toContain('COFFEE')
    }
    expect(BY_SLUG.get('mint-mojito')!.flavorTags).toEqual(['MINTY'])
  })

  it('a side of cheese dip does not make fries "cheesy"; fruit words come from the name only', () => {
    expect(BY_SLUG.get('salted-french-fries')!.flavorTags).toEqual([])
    expect(BY_SLUG.get('korean-cheesy-fries')!.flavorTags).toContain('CHEESY')
    expect(suggestFlavorTags('Korean Jalapeno Bun', 'with orange cheese sauce')).not.toContain(
      'FRUITY',
    )
  })
})

describe('recommendation validation (TC-UNIT-134, R1 part)', () => {
  it('keys match the Prisma enums exactly', () => {
    expect([...FLAVOR_TAG_KEYS].sort()).toEqual(Object.values(FlavorTag).sort())
    expect([...MEAL_ROLE_KEYS].sort()).toEqual(Object.values(MealRole).sort())
  })

  it('flavour tags: known keys only, duplicates dropped, canonical order, max 5', () => {
    expect(flavorTagsSchema.parse(['COFFEE', 'SPICY', 'COFFEE'])).toEqual(['SPICY', 'COFFEE'])
    expect(flavorTagsSchema.safeParse(['SPICY', 'evil']).success).toBe(false)
    expect(flavorTagsSchema.safeParse('SPICY').success).toBe(false)
    expect(flavorTagsSchema.safeParse(FLAVOR_TAG_KEYS.slice(0, 6)).success).toBe(false)
    expect(flavorTagsSchema.parse(FLAVOR_TAG_KEYS.slice(0, 5))).toHaveLength(5)
    expect(flavorTagsSchema.parse([])).toEqual([])
  })

  it('meal role: one of the four values', () => {
    expect(mealRoleSchema.parse('SIDE')).toBe('SIDE')
    for (const bad of ['side', 'SNACK', '', null])
      expect(mealRoleSchema.safeParse(bad).success).toBe(false)
  })
})
