import type { FlavorTagKey, MealRoleKey } from '../validation/reco'
import { FLAVOR_TAG_KEYS, MEAL_ROLE_KEYS } from '../validation/reco'
import { STOP_WORDS } from './stopwords'

/**
 * Recommendation engine (RECOMMENDATION §4–5, §9; ADR-068, ADR-073).
 *
 * A line-by-line port of notebooks/reco_lib.py, which is the specification. TC-UNIT-140 requires
 * identical lists and scores (within 1e-6) against data/reco/reference_scores.json. Parity rules:
 * - every loop over dishes runs in slug order, compared by code point (`<`), like Python;
 * - no library randomness (the split uses FNV-1a of the visit number);
 * - TF-IDF uses scikit-learn's formula with the same token pattern and stop words;
 * - MMR ties are broken by slug with the same 1e-12 margin.
 * Pure: no database or I/O, so it runs the same in scripts, tests and the app.
 */

export const SEED = 2026
export const TOP_N = 10
export const MMR_LAMBDA = 0.7
export const MAX_PER_CATEGORY = { SIMILAR: 2, COMPLEMENT: 3 } as const
const BLOCK_WEIGHTS = { category: 1.0, role: 0.5, tags: 1.5, price: 0.5, text: 1.0 }
const TASTE_SHRINK_BETA = 10
const TASTE_MIN_COMMON = 3
const BASELINE_LAMBDA_ITEM = 10
const BASELINE_LAMBDA_USER = 15
export const CF_NEIGHBOURS = 20
export const CF_DAMPING = 2
const COOC_ALPHA = 5
const COOC_MIN_PAIRS = 3
export const COOC_MIN_RATING = 3
const BAYES_M = 10

export const DAYPARTS = ['LUNCH', 'AFTERNOON', 'EVENING'] as const
export type DaypartKey = (typeof DAYPARTS)[number]
export const WINDOWS = ['ALL', ...DAYPARTS] as const
export type WindowKey = (typeof WINDOWS)[number]
export type ListKind = 'COMPLEMENT' | 'SIMILAR'

/** Weights in per-mille, as stored in RecoSettings / RecoModelRun (tuned on validation, ADR-073/074). */
export type WeightsPm = {
  compCoocPm: number
  compQualityPm: number
  compContentPm: number
  simContentPm: number
  simTastePm: number
  simQualityPm: number
}
export const DEFAULT_WEIGHTS_PM: WeightsPm = {
  compCoocPm: 500,
  compQualityPm: 0,
  compContentPm: 500,
  simContentPm: 500,
  simTastePm: 200,
  simQualityPm: 300,
}

export type EngineItem = {
  slug: string
  name: string
  description: string
  /** Category slug. */
  category: string
  mealRole: MealRoleKey
  pricePaise: number
  flavorTags: readonly FlavorTagKey[]
  isBestSeller: boolean
  isTrending: boolean
}

export type EngineRating = {
  userNo: number
  visitNo: number
  slug: string
  rating: number
  daypart: DaypartKey
}

export type ListEntry = {
  slug: string
  rank: number
  score: number
  content: number
  taste: number
  cooc: number
  quality: number
}

export type Model = {
  slugs: string[]
  items: EngineItem[]
  content: number[][]
  taste: number[][]
  tasteRaw: number[][]
  cooc: number[][]
  quality: Record<WindowKey, number[]>
  weights: ReturnType<typeof normaliseWeights>
  lists: Record<string, Record<ListKind, ListEntry[]>>
}

// ---------------------------------------------------------------- helpers

const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const zeros = (n: number) => new Array<number>(n).fill(0)
const matrix = (n: number, m = n) => Array.from({ length: n }, () => zeros(m))

function l2Rows(rows: number[][]): number[][] {
  return rows.map((r) => {
    const norm = Math.sqrt(r.reduce((s, x) => s + x * x, 0))
    return norm === 0 ? r.slice() : r.map((x) => x / norm)
  })
}

/** Daypart from an IST wall-clock hour (LUNCH before 14:00, AFTERNOON before 17:00). */
export function daypartForIstHour(hour: number): DaypartKey {
  return hour < 14 ? 'LUNCH' : hour < 17 ? 'AFTERNOON' : 'EVENING'
}

/** Daypart of an instant, in IST (UTC+5:30, no daylight saving). */
export function daypartAt(date: Date): DaypartKey {
  const ist = new Date(date.getTime() + 330 * 60_000)
  return daypartForIstHour(ist.getUTCHours())
}

// ---------------------------------------------------------------- split (§9)

/** FNV-1a 32-bit over UTF-8 bytes (same as reco_lib.fnv1a32). */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

export function isTestVisit(visitNo: number, salt = 'test', seed = SEED): boolean {
  return fnv1a32(`${seed}:${salt}:${visitNo}`) % 5 === 0
}

export function splitByVisit(
  ratings: readonly EngineRating[],
  salt = 'test',
): { train: EngineRating[]; test: EngineRating[] } {
  const train: EngineRating[] = []
  const test: EngineRating[] = []
  for (const r of ratings) (isTestVisit(r.visitNo, salt) ? test : train).push(r)
  return { train, test }
}

// ---------------------------------------------------------------- §4.1 content similarity

export function priceBand(pricePaise: number): 'under-100' | '100-200' | '200-plus' {
  const rupees = pricePaise / 100
  return rupees < 100 ? 'under-100' : rupees <= 200 ? '100-200' : '200-plus'
}

const TOKEN = /[a-z0-9]{2,}/g

/** Tokens as scikit-learn produces them: lower case, `[a-z0-9]{2,}`, stop words removed. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(TOKEN) ?? []).filter((t) => !STOP_WORDS.has(t))
}

/** TF-IDF rows (scikit-learn defaults: raw counts, smooth idf = ln((1+n)/(1+df)) + 1, L2 rows). */
export function tfidf(docs: readonly string[]): number[][] {
  const tokens = docs.map(tokenize)
  const vocab = [...new Set(tokens.flat())].sort(byCodePoint)
  const index = new Map(vocab.map((t, k) => [t, k]))
  const df = zeros(vocab.length)
  for (const doc of tokens) for (const t of new Set(doc)) df[index.get(t)!]++
  const n = docs.length
  const idf = df.map((d) => Math.log((1 + n) / (1 + d)) + 1)
  const rows = tokens.map((doc) => {
    const row = zeros(vocab.length)
    for (const t of doc) row[index.get(t)!] += 1
    return row.map((c, k) => c * idf[k])
  })
  return l2Rows(rows)
}

/** Weighted, block-normalised item vectors, in slug order. */
export function contentVectors(items: readonly EngineItem[]): number[][] {
  const categories = [...new Set(items.map((i) => i.category))].sort(byCodePoint)
  const bands = ['under-100', '100-200', '200-plus']
  const oneHot = (value: string, keys: readonly string[]) => keys.map((k) => (k === value ? 1 : 0))
  const blocks: [number[][], number][] = [
    [items.map((i) => oneHot(i.category, categories)), BLOCK_WEIGHTS.category],
    [items.map((i) => oneHot(i.mealRole, MEAL_ROLE_KEYS)), BLOCK_WEIGHTS.role],
    [
      items.map((i) => FLAVOR_TAG_KEYS.map((t) => (i.flavorTags.includes(t) ? 1 : 0))),
      BLOCK_WEIGHTS.tags,
    ],
    [items.map((i) => oneHot(priceBand(i.pricePaise), bands)), BLOCK_WEIGHTS.price],
    [tfidf(items.map((i) => `${i.name} ${i.description}`)), BLOCK_WEIGHTS.text],
  ]
  const weighted = blocks.map(([rows, w]) => l2Rows(rows).map((r) => r.map((x) => x * w)))
  return items.map((_, k) => weighted.flatMap((b) => b[k]))
}

export function contentSimilarity(vectors: number[][]): number[][] {
  const v = l2Rows(vectors)
  const n = v.length
  const sim = matrix(n)
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      let dot = 0
      for (let k = 0; k < v[i].length; k++) dot += v[i][k] * v[j][k]
      sim[i][j] = Math.min(1, Math.max(0, dot))
    }
  return sim
}

// ---------------------------------------------------------------- §4.2 taste (baseline residual CF)

export type RatingMatrix = { users: number[]; values: (number | null)[][] }

export function ratingMatrix(
  ratings: readonly EngineRating[],
  slugs: readonly string[],
): RatingMatrix {
  const users = [...new Set(ratings.map((r) => r.userNo))].sort((a, b) => a - b)
  const ui = new Map(users.map((u, k) => [u, k]))
  const ii = new Map(slugs.map((s, k) => [s, k]))
  const values = users.map(() => new Array<number | null>(slugs.length).fill(null))
  for (const r of ratings) {
    const j = ii.get(r.slug)
    if (j !== undefined) values[ui.get(r.userNo)!][j] = r.rating
  }
  return { users, values }
}

export type Baseline = { mu: number; bItem: number[]; bUser: number[] }

export function baseline(m: RatingMatrix): Baseline {
  const nItems = m.values[0]?.length ?? 0
  // μ: mean of all ratings.
  let sum = 0
  let count = 0
  for (const row of m.values)
    for (const v of row) {
      if (v === null) continue
      sum += v
      count++
    }
  const mu = count ? sum / count : 3
  // b_i = Σ(r − μ) / (λ_item + n_i): how much better or worse a dish is rated than average.
  const devSum = zeros(nItems)
  const itemN = zeros(nItems)
  for (const row of m.values)
    row.forEach((v, j) => {
      if (v === null) return
      devSum[j] += v - mu
      itemN[j]++
    })
  const bItem = devSum.map((s, j) => s / (BASELINE_LAMBDA_ITEM + itemN[j]))
  // b_u = Σ(r − μ − b_i) / (λ_user + n_u): whether a user rates generously or strictly.
  const bUser = m.values.map((row) => {
    let s = 0
    let n = 0
    row.forEach((v, j) => {
      if (v === null) return
      s += v - mu - bItem[j]
      n++
    })
    return s / (BASELINE_LAMBDA_USER + n)
  })
  return { mu, bItem, bUser }
}

export function predictBaseline(b: Baseline, userIndex: number, item: number): number {
  return b.mu + (userIndex >= 0 ? b.bUser[userIndex] : 0) + b.bItem[item]
}

export function residuals(m: RatingMatrix, b: Baseline): (number | null)[][] {
  return m.values.map((row, u) =>
    row.map((v, j) => (v === null ? null : v - (b.mu + b.bUser[u] + b.bItem[j]))),
  )
}

/** Shrunk cosine of residuals over co-raters (signed); diagonal 0. */
export function tasteRaw(res: (number | null)[][], nItems: number): number[][] {
  const sim = matrix(nItems)
  for (let i = 0; i < nItems; i++)
    for (let j = i + 1; j < nItems; j++) {
      let n = 0
      let ab = 0
      let aa = 0
      let bb = 0
      for (const row of res) {
        const a = row[i]
        const b = row[j]
        if (a === null || b === null) continue
        n++
        ab += a * b
        aa += a * a
        bb += b * b
      }
      if (n < TASTE_MIN_COMMON) continue
      const den = Math.sqrt(aa) * Math.sqrt(bb)
      if (den === 0) continue
      sim[i][j] = sim[j][i] = (ab / den) * (n / (n + TASTE_SHRINK_BETA))
    }
  return sim
}

export function perSourceNormalise(scores: number[][]): number[][] {
  return scores.map((row) => {
    const top = Math.max(...row)
    return top > 0 ? row.map((x) => x / top) : zeros(row.length)
  })
}

export function tasteSimilarity(raw: number[][]): number[][] {
  return perSourceNormalise(raw.map((r) => r.map((x) => Math.max(0, x))))
}

/** Rating prediction (§9 only): b_uj + Σ s·e / (Σ s + λ) over the 20 most similar rated dishes. */
export function predictRating(
  raw: number[][],
  res: (number | null)[][],
  b: Baseline,
  userIndex: number,
  item: number,
  damping = CF_DAMPING,
): number {
  let pred = predictBaseline(b, userIndex, item)
  if (userIndex >= 0) {
    const neighbours: { s: number; e: number; j: number }[] = []
    res[userIndex].forEach((e, j) => {
      if (e !== null && j !== item && raw[item][j] > 0) neighbours.push({ s: raw[item][j], e, j })
    })
    // numpy argsort(-s, kind="stable"): descending similarity, ties in index order.
    neighbours.sort((x, y) => y.s - x.s || x.j - y.j)
    const top = neighbours.slice(0, CF_NEIGHBOURS)
    if (top.length) {
      const ws = top.reduce((s, x) => s + x.s, 0)
      pred += top.reduce((s, x) => s + x.s * x.e, 0) / (ws + damping)
    }
  }
  return Math.min(5, Math.max(1, pred))
}

// ---------------------------------------------------------------- §4.3 visit co-occurrence

export type CoocStats = {
  nI: number[]
  nIJ: number[][]
  visits: number
  confidence: number[][]
  lift: number[][]
}

export function cooccurrence(
  ratings: readonly EngineRating[],
  slugs: readonly string[],
): CoocStats {
  const ii = new Map(slugs.map((s, k) => [s, k]))
  const baskets = new Map<number, number[]>()
  for (const r of ratings) {
    if (r.rating < COOC_MIN_RATING) continue
    const j = ii.get(r.slug)
    if (j === undefined) continue
    baskets.set(r.visitNo, [...(baskets.get(r.visitNo) ?? []), j])
  }
  const n = slugs.length
  const nI = zeros(n)
  const nIJ = matrix(n)
  for (const basket of baskets.values()) {
    for (const x of basket) nI[x]++
    for (const x of basket) for (const y of basket) if (x !== y) nIJ[x][y]++
  }
  const visits = baskets.size
  const confidence = matrix(n)
  const lift = matrix(n)
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i === j || nIJ[i][j] === 0) continue
      lift[i][j] = (nIJ[i][j] * visits) / (nI[i] * nI[j])
      if (nIJ[i][j] >= COOC_MIN_PAIRS && lift[i][j] > 1)
        confidence[i][j] = nIJ[i][j] / (nI[i] + COOC_ALPHA)
    }
  return { nI, nIJ, visits, confidence, lift }
}

// ---------------------------------------------------------------- §4.4 quality

export function bayesianAverage(
  ratings: readonly EngineRating[],
  slugs: readonly string[],
): number[] {
  const mu = ratings.length ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length : 3
  const sum = new Map<string, number>()
  const cnt = new Map<string, number>()
  for (const r of ratings) {
    sum.set(r.slug, (sum.get(r.slug) ?? 0) + r.rating)
    cnt.set(r.slug, (cnt.get(r.slug) ?? 0) + 1)
  }
  return slugs.map((s) =>
    cnt.has(s) ? (BAYES_M * mu + sum.get(s)!) / (BAYES_M + cnt.get(s)!) : mu,
  )
}

export function minmax(x: number[]): number[] {
  const lo = Math.min(...x)
  const hi = Math.max(...x)
  return hi > lo ? x.map((v) => (v - lo) / (hi - lo)) : zeros(x.length)
}

export const flagScore = (i: Pick<EngineItem, 'isBestSeller' | 'isTrending'>) =>
  i.isBestSeller ? 1 : i.isTrending ? 0.6 : 0

export function quality(
  ratings: readonly EngineRating[],
  items: readonly EngineItem[],
): Record<WindowKey, number[]> {
  const slugs = items.map((i) => i.slug)
  const f = items.map(flagScore)
  const score = (part: readonly EngineRating[]) =>
    minmax(bayesianAverage(part, slugs)).map((v, k) => 0.7 * v + 0.3 * f[k])
  return {
    ALL: score(ratings),
    LUNCH: score(ratings.filter((r) => r.daypart === 'LUNCH')),
    AFTERNOON: score(ratings.filter((r) => r.daypart === 'AFTERNOON')),
    EVENING: score(ratings.filter((r) => r.daypart === 'EVENING')),
  }
}

// ---------------------------------------------------------------- §4.5 hybrid + MMR

export function normaliseWeights(w: WeightsPm) {
  const cs = w.compCoocPm + w.compQualityPm + w.compContentPm
  const ss = w.simContentPm + w.simTastePm + w.simQualityPm
  if (cs <= 0 || ss <= 0) throw new Error('Each list needs at least one weight above zero.')
  return {
    compCooc: w.compCoocPm / cs,
    compQuality: w.compQualityPm / cs,
    compContent: w.compContentPm / cs,
    simContent: w.simContentPm / ss,
    simTaste: w.simTastePm / ss,
    simQuality: w.simQualityPm / ss,
  }
}

function mmr(
  candidates: number[],
  score: Map<number, number>,
  content: number[][],
  categories: string[],
  maxPerCategory: number,
  slugs: string[],
): number[] {
  const chosen: number[] = []
  const perCat = new Map<string, number>()
  const pool = [...candidates].sort((a, b) => byCodePoint(slugs[a], slugs[b]))
  while (pool.length && chosen.length < TOP_N) {
    let best: number | null = null
    let bestVal = -Infinity
    for (const j of pool) {
      if ((perCat.get(categories[j]) ?? 0) >= maxPerCategory) continue
      const redundancy = chosen.length ? Math.max(...chosen.map((s) => content[j][s])) : 0
      const val = MMR_LAMBDA * score.get(j)! - (1 - MMR_LAMBDA) * redundancy
      if (val > bestVal + 1e-12) {
        best = j
        bestVal = val
      }
    }
    if (best === null) break
    chosen.push(best)
    perCat.set(categories[best], (perCat.get(categories[best]) ?? 0) + 1)
    pool.splice(pool.indexOf(best), 1)
  }
  return chosen
}

export function buildLists(model: Omit<Model, 'lists'>): Model['lists'] {
  const { weights: w, slugs, items, content, taste, cooc } = model
  const q = model.quality.ALL
  const roles = items.map((i) => i.mealRole)
  const cats = items.map((i) => i.category)
  const out: Model['lists'] = {}
  slugs.forEach((slug, i) => {
    const others = slugs.map((_, j) => j).filter((j) => j !== i)
    const comp = others.filter((j) => roles[j] !== roles[i])
    const sim = others.filter((j) => roles[j] === roles[i])
    const compScore = new Map(
      comp.map((j) => [
        j,
        w.compCooc * cooc[i][j] + w.compQuality * q[j] + w.compContent * content[i][j],
      ]),
    )
    const simScore = new Map(
      sim.map((j) => [
        j,
        w.simContent * content[i][j] + w.simTaste * taste[i][j] + w.simQuality * q[j],
      ]),
    )
    const entry = {} as Record<ListKind, ListEntry[]>
    for (const [kind, cand, score] of [
      ['COMPLEMENT', comp, compScore],
      ['SIMILAR', sim, simScore],
    ] as const) {
      entry[kind] = mmr(cand, score, content, cats, MAX_PER_CATEGORY[kind], slugs).map((j, r) => ({
        slug: slugs[j],
        rank: r + 1,
        score: score.get(j)!,
        content: content[i][j],
        taste: taste[i][j],
        cooc: cooc[i][j],
        quality: q[j],
      }))
    }
    out[slug] = entry
  })
  return out
}

/** Fits every component and builds the lists. `items` may be in any order. */
export function train(
  items: readonly EngineItem[],
  ratings: readonly EngineRating[],
  weightsPm: WeightsPm = DEFAULT_WEIGHTS_PM,
): Model {
  const sorted = [...items].sort((a, b) => byCodePoint(a.slug, b.slug))
  const slugs = sorted.map((i) => i.slug)
  const content = contentSimilarity(contentVectors(sorted))
  const m = ratingMatrix(ratings, slugs)
  const base = baseline(m)
  const raw = tasteRaw(residuals(m, base), slugs.length)
  const partial = {
    slugs,
    items: sorted,
    content,
    taste: tasteSimilarity(raw),
    tasteRaw: raw,
    cooc: perSourceNormalise(cooccurrence(ratings, slugs).confidence),
    quality: quality(ratings, sorted),
    weights: normaliseWeights(weightsPm),
  }
  return { ...partial, lists: buildLists(partial) }
}

export function withWeights(model: Model, weightsPm: WeightsPm): Model {
  const partial = { ...model, weights: normaliseWeights(weightsPm) }
  return { ...partial, lists: buildLists(partial) }
}

// ---------------------------------------------------------------- §9 evaluation

export const top = (model: Model, slug: string, kind: ListKind, k = 5) =>
  (model.lists[slug]?.[kind] ?? []).slice(0, k).map((e) => e.slug)

type Recommend = (slug: string) => string[]

export function evalComplement(recommend: Recommend, test: readonly EngineRating[], k = 5) {
  const visits = new Map<number, Set<string>>()
  for (const r of test) {
    if (r.rating < COOC_MIN_RATING) continue
    visits.set(r.visitNo, (visits.get(r.visitNo) ?? new Set()).add(r.slug))
  }
  let hits = 0
  let precision = 0
  let recall = 0
  let queries = 0
  for (const visitNo of [...visits.keys()].sort((a, b) => a - b)) {
    const items = [...visits.get(visitNo)!].sort(byCodePoint)
    if (items.length < 2) continue
    for (const x of items) {
      const rest = new Set(items.filter((y) => y !== x))
      const got = recommend(x)
        .slice(0, k)
        .filter((s) => rest.has(s)).length
      queries++
      if (got > 0) hits++
      precision += got / k
      recall += got / rest.size
    }
  }
  const q = Math.max(queries, 1)
  return { queries, hitRate: hits / q, precision: precision / q, recall: recall / q }
}

export function evalSimilar(
  recommend: Recommend,
  train: readonly EngineRating[],
  test: readonly EngineRating[],
  roles: ReadonlyMap<string, MealRoleKey>,
  k = 5,
) {
  const liked = new Map<number, Set<string>>()
  for (const r of train)
    if (r.rating >= 4) liked.set(r.userNo, (liked.get(r.userNo) ?? new Set()).add(r.slug))
  let hits = 0
  let pairs = 0
  for (const t of test) {
    if (t.rating < 4) continue
    for (const q of [...(liked.get(t.userNo) ?? [])].sort(byCodePoint)) {
      if (roles.get(q) !== roles.get(t.slug) || q === t.slug) continue
      pairs++
      if (recommend(q).slice(0, k).includes(t.slug)) hits++
    }
  }
  return { pairs, hitRate: hits / Math.max(pairs, 1) }
}

export function coverage(model: Model, k = 5): number {
  const seen = new Set<string>()
  for (const s of model.slugs)
    for (const kind of ['COMPLEMENT', 'SIMILAR'] as const)
      top(model, s, kind, k).forEach((x) => seen.add(x))
  return seen.size / model.slugs.length
}

/** RMSE/MAE of item CF on held-out ratings, fitted on `train` (§9). */
export function ratingErrors(
  model: Model,
  train: readonly EngineRating[],
  test: readonly EngineRating[],
) {
  const m = ratingMatrix(train, model.slugs)
  const base = baseline(m)
  const res = residuals(m, base)
  const ui = new Map(m.users.map((u, k) => [u, k]))
  const ii = new Map(model.slugs.map((s, k) => [s, k]))
  const errors = test.map(
    (r) =>
      predictRating(model.tasteRaw, res, base, ui.get(r.userNo) ?? -1, ii.get(r.slug)!) - r.rating,
  )
  const n = Math.max(errors.length, 1)
  return {
    rmse: Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n),
    mae: errors.reduce((s, e) => s + Math.abs(e), 0) / n,
  }
}

/** Popularity-only ranking (the quality score), restricted like the list kind: the gate's baseline. */
export function popularityRecommender(model: Model, kind: ListKind): Recommend {
  const q = model.quality.ALL
  const role = new Map(model.items.map((i) => [i.slug, i.mealRole]))
  const order = model.slugs
    .map((s, j) => ({ s, q: q[j] }))
    .sort((a, b) => b.q - a.q || byCodePoint(b.s, a.s))
    .map((x) => x.s)
  return (slug) =>
    order.filter((s) => s !== slug && (role.get(s) !== role.get(slug)) === (kind === 'COMPLEMENT'))
}
