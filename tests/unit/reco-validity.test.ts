// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  daypartForIstHour,
  train,
  type EngineItem,
  type EngineRating,
  type ListKind,
} from '../../src/lib/reco/engine'
import type { FlavorTagKey, MealRoleKey } from '../../src/lib/validation/reco'
import { reasonsFor } from '../../src/server/reco/train'

/**
 * "Do the recommendations make sense?" (TC-UNIT-143, requested by the team in R3).
 * Runs the real engine on the real 65-dish Sangli menu and the demo feedback, then checks the lists
 * against food common sense and against the meal patterns the demo data was built from
 * (RECOMMENDATION §3.4). Thresholds are the measured values, rounded DOWN, so a regression fails.
 */

function readCsv(path: string): Record<string, string>[] {
  const [header, ...lines] = readFileSync(path, 'utf8').trimEnd().split('\n')
  const cols = header.split(',')
  return lines.map((l) =>
    Object.fromEntries(
      [...l.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)]
        .slice(0, cols.length)
        .map((m, k) => [cols[k], m[1].replace(/^"|"$/g, '').replace(/""/g, '"')]),
    ),
  )
}
const ITEMS: EngineItem[] = readCsv('data/reco/menu_items.csv').map((r) => ({
  slug: r.item_slug,
  name: r.item_name,
  description: r.description,
  category: r.category,
  mealRole: r.meal_role as MealRoleKey,
  pricePaise: Math.round(Number(r.price_rupees) * 100),
  flavorTags: r.flavor_tags ? (r.flavor_tags.split('|') as FlavorTagKey[]) : [],
  isBestSeller: r.is_best_seller === 'true',
  isTrending: r.is_trending === 'true',
}))
const RATINGS: EngineRating[] = readCsv('data/reco/demo_feedback.csv').map((r) => ({
  userNo: Number(r.user_id),
  visitNo: Number(r.visit_id),
  slug: r.item_slug,
  rating: Number(r.rating),
  daypart: daypartForIstHour(Number(r.timestamp.slice(11, 13))),
}))
const MODEL = train(ITEMS, RATINGS)
const BY = new Map(ITEMS.map((i) => [i.slug, i]))
const topN = (slug: string, kind: ListKind, n: number) =>
  MODEL.lists[slug][kind].slice(0, n).map((e) => BY.get(e.slug)!)
const share = (xs: EngineItem[], ok: (i: EngineItem) => boolean) => xs.filter(ok).length / xs.length
const of = (pred: (i: EngineItem) => boolean) => ITEMS.filter(pred)

describe('every list is well-formed for every real dish', () => {
  it('enough suggestions remain after hiding sold-out dishes (≥ 7 stored per list)', () => {
    for (const i of ITEMS) {
      expect(MODEL.lists[i.slug].COMPLEMENT.length, i.name).toBeGreaterThanOrEqual(7)
      expect(MODEL.lists[i.slug].SIMILAR.length, i.name).toBeGreaterThanOrEqual(7)
    }
  })

  it('no dish recommends itself, and no list repeats a dish', () => {
    for (const i of ITEMS)
      for (const kind of ['COMPLEMENT', 'SIMILAR'] as const) {
        const slugs = MODEL.lists[i.slug][kind].map((e) => e.slug)
        expect(slugs).not.toContain(i.slug)
        expect(new Set(slugs).size).toBe(slugs.length)
      }
  })

  it('variety: at least 55 of the 65 dishes appear in some top-4 list', () => {
    const seen = new Set(
      ITEMS.flatMap((i) =>
        [...topN(i.slug, 'COMPLEMENT', 4), ...topN(i.slug, 'SIMILAR', 4)].map((t) => t.slug),
      ),
    )
    expect(seen.size).toBeGreaterThanOrEqual(55)
  })
})

describe('"Goes well with" completes a meal', () => {
  it('every main gets a side or a drink in its top 4; ≥ 95 % get a drink and 100 % a side', () => {
    const mains = of((i) => i.mealRole === 'MAIN')
    expect(
      share(mains, (m) => topN(m.slug, 'COMPLEMENT', 4).some((t) => t.mealRole !== 'MAIN')),
    ).toBe(1)
    expect(
      share(mains, (m) => topN(m.slug, 'COMPLEMENT', 4).some((t) => t.mealRole === 'SIDE')),
    ).toBe(1)
    expect(
      share(mains, (m) => topN(m.slug, 'COMPLEMENT', 4).some((t) => t.mealRole === 'DRINK')),
    ).toBeGreaterThanOrEqual(0.95)
  })

  it('every drink is paired with food (a main or a side) in its top 4', () => {
    const drinks = of((i) => i.mealRole === 'DRINK')
    expect(
      share(drinks, (d) => topN(d.slug, 'COMPLEMENT', 4).some((t) => t.mealRole !== 'DRINK')),
    ).toBe(1)
  })

  it('learns the meal patterns behind the data (burgers, pizza, Maggi)', () => {
    const inTop5 = (cat: string, partners: string[]) =>
      share(
        of((i) => i.category === cat),
        (i) => topN(i.slug, 'COMPLEMENT', 5).some((t) => partners.includes(t.category)),
      )
    expect(inTop5('burgers', ['fries', 'mojito', 'cold-coffee', 'ice-tea'])).toBe(1) // P1 burger meal
    expect(inTop5('pizza', ['garlic-bread', 'mojito', 'cold-coffee'])).toBe(1) // P2 pizza share
    expect(inTop5('maggi', ['hot-beverages'])).toBe(1) // P6 Maggi and chai
  })

  it('Korean mains are paired with a Korean side or drink', () => {
    const korean = of((i) => i.mealRole === 'MAIN' && i.flavorTags.includes('KOREAN'))
    expect(korean.length).toBeGreaterThan(2)
    expect(
      share(korean, (k) =>
        topN(k.slug, 'COMPLEMENT', 5).some((t) => t.flavorTags.includes('KOREAN')),
      ),
    ).toBe(1)
  })

  it('spot checks on real dishes', () => {
    const names = (slug: string) => topN(slug, 'COMPLEMENT', 4).map((t) => t.name)
    expect(names('classic-burger')).toContain('Salted French Fries')
    expect(names('kulhad-maggi').some((n) => /Tea|Coffee|Chocolate/.test(n))).toBe(true)
    expect(names('korean-burger').some((n) => n.startsWith('Korean'))).toBe(true)
  })
})

describe('"You may also like" stays similar', () => {
  it('always the same meal role (a drink for a drink, a main for a main)', () => {
    for (const i of ITEMS)
      for (const t of MODEL.lists[i.slug].SIMILAR)
        expect(t && BY.get(t.slug)!.mealRole).toBe(i.mealRole)
  })

  it('≥ 60 % of the top 3 share the category or a flavour tag (measured 67 %)', () => {
    let related = 0
    let total = 0
    for (const i of ITEMS)
      for (const t of topN(i.slug, 'SIMILAR', 3)) {
        total++
        if (t.category === i.category || t.flavorTags.some((x) => i.flavorTags.includes(x)))
          related++
      }
    expect(related / total).toBeGreaterThanOrEqual(0.6)
  })

  it('every coffee suggests another coffee, every chocolate shake another chocolate drink', () => {
    const coffees = of((i) => i.flavorTags.includes('COFFEE'))
    expect(
      share(coffees, (c) =>
        topN(c.slug, 'SIMILAR', 3).some((t) => t.flavorTags.includes('COFFEE')),
      ),
    ).toBe(1)
    const shakes = of((i) => i.category === 'milk-shakes' && i.flavorTags.includes('CHOCOLATE'))
    expect(
      share(shakes, (s) =>
        topN(s.slug, 'SIMILAR', 3).some((t) => t.flavorTags.includes('CHOCOLATE')),
      ),
    ).toBe(1)
  })

  it('momos suggest the other momos first', () => {
    expect(topN('steam-momos', 'SIMILAR', 1)[0].slug).toBe('fried-momos')
  })
})

describe('reason codes are always true (honesty, NFR-014)', () => {
  it('stored codes match the data: role differs for pairing, tags really shared, category really equal', () => {
    for (const i of ITEMS)
      for (const kind of ['COMPLEMENT', 'SIMILAR'] as const)
        for (const e of MODEL.lists[i.slug][kind]) {
          const t = BY.get(e.slug)!
          for (const code of reasonsFor(kind, i, t)) {
            if (code === 'PAIRS_WITH_ROLE') expect(t.mealRole).not.toBe(i.mealRole)
            if (code === 'SHARED_TAGS')
              expect(t.flavorTags.some((x) => i.flavorTags.includes(x))).toBe(true)
            if (code === 'SAME_CATEGORY') expect(t.category).toBe(i.category)
          }
        }
  })
})
