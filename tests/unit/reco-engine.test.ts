// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  coverage,
  daypartAt,
  daypartForIstHour,
  DEFAULT_WEIGHTS_PM,
  evalComplement,
  evalSimilar,
  fnv1a32,
  isTestVisit,
  normaliseWeights,
  popularityRecommender,
  ratingErrors,
  splitByVisit,
  tfidf,
  tokenize,
  top,
  train,
  withWeights,
  type EngineItem,
  type EngineRating,
  type WeightsPm,
} from '../../src/lib/reco/engine'
import { STOP_WORDS } from '../../src/lib/reco/stopwords'
import type { FlavorTagKey, MealRoleKey } from '../../src/lib/validation/reco'

/**
 * TypeScript engine vs the Python reference (notebooks/reco_lib.py): TC-UNIT-135…138, TC-UNIT-140.
 * Inputs are the committed demo CSVs; expected outputs are the notebook's exports.
 */

/** Minimal CSV parser (quoted cells may contain commas and doubled quotes). */
function readCsv(path: string): Record<string, string>[] {
  const [header, ...lines] = readFileSync(path, 'utf8').trimEnd().split('\n')
  const parse = (line: string) =>
    [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)]
      .map((m) => m[1].replace(/^"|"$/g, '').replace(/""/g, '"'))
      .slice(0, header.split(',').length)
  const cols = header.split(',')
  return lines.map((l) => Object.fromEntries(parse(l).map((v, k) => [cols[k], v])))
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
type RefEntry = {
  slug: string
  rank: number
  score: number
  content: number
  taste: number
  cooc: number
  quality: number
}
const REF = JSON.parse(readFileSync('data/reco/reference_scores.json', 'utf8')) as {
  weights_pm: WeightsPm
  items: Record<string, Record<'COMPLEMENT' | 'SIMILAR', RefEntry[]>>
  quality: Record<string, Record<'ALL' | 'LUNCH' | 'AFTERNOON' | 'EVENING', number>>
}
const EVAL = JSON.parse(readFileSync('data/reco/evaluation.json', 'utf8')) as {
  chosen_weights_pm: WeightsPm
  complement: { method: string; hit_rate: number; precision: number; recall: number }[]
  similar: { method: string; hit_rate: number }[]
  rating_prediction: { method: string; 'test RMSE': number; 'test MAE': number }[]
  coverage: number
}

const MODEL = train(ITEMS, RATINGS, REF.weights_pm)

describe('parity with the Python reference (TC-UNIT-140)', () => {
  it('uses the same stop words as data/reco/stopwords.txt', () => {
    const file = readFileSync('data/reco/stopwords.txt', 'utf8')
      .split('\n')
      .filter((w) => w && !w.startsWith('#'))
    expect([...STOP_WORDS].sort()).toEqual(file.sort())
  })

  it('the tuned weights are the engine defaults', () => {
    expect(REF.weights_pm).toEqual(DEFAULT_WEIGHTS_PM)
    expect(EVAL.chosen_weights_pm).toEqual(DEFAULT_WEIGHTS_PM)
  })

  it('every dish has the same COMPLEMENT and SIMILAR lists (order and all score components)', () => {
    expect(Object.keys(MODEL.lists).sort()).toEqual(Object.keys(REF.items).sort())
    let compared = 0
    for (const [slug, kinds] of Object.entries(REF.items))
      for (const kind of ['COMPLEMENT', 'SIMILAR'] as const) {
        const ours = MODEL.lists[slug][kind]
        const theirs = kinds[kind]
        expect(
          ours.map((e) => e.slug),
          `${slug} ${kind}`,
        ).toEqual(theirs.map((e) => e.slug))
        ours.forEach((e, k) => {
          for (const f of ['score', 'content', 'taste', 'cooc', 'quality'] as const)
            expect(Math.abs(e[f] - theirs[k][f]), `${slug} ${kind} #${k + 1} ${f}`).toBeLessThan(
              1e-6,
            )
          expect(e.rank).toBe(theirs[k].rank)
          compared++
        })
      }
    expect(compared).toBeGreaterThan(1000)
  })

  it('quality per daypart matches', () => {
    MODEL.slugs.forEach((s, k) => {
      for (const w of ['ALL', 'LUNCH', 'AFTERNOON', 'EVENING'] as const)
        expect(Math.abs(MODEL.quality[w][k] - REF.quality[s][w])).toBeLessThan(1e-9)
    })
  })

  it('evaluation on the test split reproduces the notebook numbers', () => {
    const { train: trainSet, test } = splitByVisit(RATINGS)
    const m = train(ITEMS, trainSet, DEFAULT_WEIGHTS_PM)
    const roles = new Map(ITEMS.map((i) => [i.slug, i.mealRole]))
    const comp = evalComplement((s) => top(m, s, 'COMPLEMENT', 10), test)
    const sim = evalSimilar((s) => top(m, s, 'SIMILAR', 10), trainSet, test, roles)
    const ref = (name: string) => EVAL.complement.find((r) => r.method === name)!
    expect(comp.hitRate).toBeCloseTo(ref('Hybrid (website)').hit_rate, 4)
    expect(comp.precision).toBeCloseTo(ref('Hybrid (website)').precision, 4)
    expect(comp.recall).toBeCloseTo(ref('Hybrid (website)').recall, 4)
    expect(sim.hitRate).toBeCloseTo(
      EVAL.similar.find((r) => r.method === 'Hybrid (website)')!.hit_rate,
      4,
    )
    expect(coverage(m)).toBeCloseTo(EVAL.coverage, 4)
    expect(evalComplement(popularityRecommender(m, 'COMPLEMENT'), test).hitRate).toBeCloseTo(
      ref('Popularity').hit_rate,
      4,
    )
    const cf = EVAL.rating_prediction.find((r) => r.method.startsWith('Item–item CF'))!
    const err = ratingErrors(m, trainSet, test)
    expect(err.rmse).toBeCloseTo(cf['test RMSE'], 4)
    expect(err.mae).toBeCloseTo(cf['test MAE'], 4)
  })
})

describe('TF-IDF and content (TC-UNIT-135)', () => {
  it('tokenizes like scikit-learn: lower case, [a-z0-9]{2,}, stop words removed', () => {
    expect(tokenize('Veg patty, fresh veggies and ZORKO special sauces. 6 pieces')).toEqual([
      'veg',
      'patty',
      'fresh',
      'veggies',
      'zorko',
      'special',
      'sauces',
      'pieces',
    ])
    expect(tokenize('Jalapeños & a 2x deal')).toEqual(['jalape', 'os', '2x', 'deal'])
  })

  it('matches hand-computed scikit-learn TF-IDF', () => {
    // docs: "spicy pizza", "cheesy pizza" → n = 2; idf(pizza) = ln(3/3)+1 = 1, idf(spicy) = ln(3/2)+1
    const rows = tfidf(['spicy pizza', 'cheesy pizza'])
    const idf = Math.log(3 / 2) + 1
    const norm = Math.sqrt(idf * idf + 1)
    // vocabulary is sorted: cheesy, pizza, spicy
    expect(rows[0][0]).toBeCloseTo(0, 12)
    expect(rows[0][1]).toBeCloseTo(1 / norm, 12)
    expect(rows[0][2]).toBeCloseTo(idf / norm, 12)
  })
})

describe('lists: rules (TC-UNIT-137)', () => {
  it('COMPLEMENT only other meal roles, SIMILAR the same role, never itself, top 10', () => {
    const role = new Map(ITEMS.map((i) => [i.slug, i.mealRole]))
    for (const [slug, kinds] of Object.entries(MODEL.lists)) {
      expect(kinds.COMPLEMENT.length).toBeLessThanOrEqual(10)
      for (const e of kinds.COMPLEMENT) expect(role.get(e.slug)).not.toBe(role.get(slug))
      for (const e of kinds.SIMILAR) expect(role.get(e.slug)).toBe(role.get(slug))
      expect([...kinds.COMPLEMENT, ...kinds.SIMILAR].some((e) => e.slug === slug)).toBe(false)
    }
  })

  it('diversity: at most 2 per category in SIMILAR, 3 in COMPLEMENT', () => {
    const cat = new Map(ITEMS.map((i) => [i.slug, i.category]))
    for (const kinds of Object.values(MODEL.lists))
      for (const [kind, max] of [
        ['SIMILAR', 2],
        ['COMPLEMENT', 3],
      ] as const) {
        const counts = new Map<string, number>()
        for (const e of kinds[kind])
          counts.set(cat.get(e.slug)!, (counts.get(cat.get(e.slug)!) ?? 0) + 1)
        for (const n of counts.values()) expect(n).toBeLessThanOrEqual(max)
      }
  })

  it('scores and components are within [0, 1] (the database CHECK agrees)', () => {
    for (const kinds of Object.values(MODEL.lists))
      for (const e of [...kinds.COMPLEMENT, ...kinds.SIMILAR])
        for (const f of ['score', 'content', 'taste', 'cooc', 'quality'] as const) {
          expect(e[f]).toBeGreaterThanOrEqual(0)
          expect(e[f]).toBeLessThanOrEqual(1 + 1e-12)
        }
  })

  it('re-weighting changes the order but not the rules; all-zero weights are refused', () => {
    const m = withWeights(MODEL, {
      ...DEFAULT_WEIGHTS_PM,
      simContentPm: 1000,
      simTastePm: 0,
      simQualityPm: 0,
    })
    expect(m.lists['korean-burger'].SIMILAR[0].score).toBeCloseTo(
      m.lists['korean-burger'].SIMILAR[0].content,
      12,
    )
    expect(() =>
      normaliseWeights({
        ...DEFAULT_WEIGHTS_PM,
        compCoocPm: 0,
        compQualityPm: 0,
        compContentPm: 0,
      }),
    ).toThrow()
  })

  it('works with no ratings at all (cold start): content and flags only', () => {
    const cold = train(ITEMS, [])
    expect(cold.lists['korean-burger'].SIMILAR.length).toBeGreaterThan(3)
    expect(cold.lists['korean-burger'].COMPLEMENT.every((e) => e.cooc === 0 && e.taste === 0)).toBe(
      true,
    )
  })
})

describe('evaluation metrics and split (TC-UNIT-138)', () => {
  it('computes HitRate, Precision and Recall on a tiny fixture', () => {
    const test: EngineRating[] = [
      { userNo: 1, visitNo: 1, slug: 'a', rating: 5, daypart: 'LUNCH' },
      { userNo: 1, visitNo: 1, slug: 'b', rating: 4, daypart: 'LUNCH' },
      { userNo: 1, visitNo: 1, slug: 'c', rating: 2, daypart: 'LUNCH' }, // not enjoyed: ignored
    ]
    const rec = (s: string) => (s === 'a' ? ['b', 'x', 'y', 'z', 'w'] : ['x', 'y', 'z', 'w', 'v'])
    expect(evalComplement(rec, test)).toEqual({
      queries: 2,
      hitRate: 0.5,
      precision: 0.1,
      recall: 0.5,
    })
  })

  it('FNV-1a split is the same as Python and holds out about 20 % of visits', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5)
    expect(fnv1a32('a')).toBe(0xe40c292c)
    const visits = [...new Set(RATINGS.map((r) => r.visitNo))]
    const share = visits.filter((v) => isTestVisit(v)).length / visits.length
    expect(share).toBeGreaterThan(0.17)
    expect(share).toBeLessThan(0.23)
  })

  it('dayparts follow IST', () => {
    expect(daypartAt(new Date('2026-08-01T05:30:00Z'))).toBe('LUNCH') // 11:00 IST
    expect(daypartAt(new Date('2026-08-01T08:30:00Z'))).toBe('AFTERNOON') // 14:00 IST
    expect(daypartAt(new Date('2026-08-01T11:29:00Z'))).toBe('AFTERNOON') // 16:59 IST
    expect(daypartAt(new Date('2026-08-01T11:30:00Z'))).toBe('EVENING') // 17:00 IST
  })
})
