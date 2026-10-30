import {
  FLAVOR_TAG_KEYS as FLAVOR_ORDER,
  type FlavorTagKey,
  type MealRoleKey,
} from '../validation/reco'

/**
 * Demo feedback (ratings) generator — RECOMMENDATION §3, ADR-071.
 *
 * The website has no orders or billing, so the recommender is trained on a GENERATED dataset in
 * the format of the team's feedback.csv plus `visit_id` (dishes eaten on the same visit).
 * Pure and seeded: the same menu and seed always give exactly the same rows (TC-UNIT-130).
 * The output is demonstration data: it is never shown on the website and never stored in the real
 * `Feedback` table.
 */

export const GENERATOR_VERSION = 1
export const DEFAULT_SEED = 2026

export type MenuItemInput = {
  slug: string
  name: string
  categorySlug: string
  mealRole: MealRoleKey
  pricePaise: number
  flavorTags: FlavorTagKey[]
  isBestSeller: boolean
  isTrending: boolean
}

export type Daypart = 'LUNCH' | 'AFTERNOON' | 'EVENING'
export type Sentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'

export type DemoVisitRow = {
  visitNo: number
  demoUserNo: number
  /** IST wall-clock time, "YYYY-MM-DD HH:MM:00" (same as the team's CSV). */
  visitedAtIst: string
  daypart: Daypart
  pattern: string
}

export type DemoRatingRow = {
  feedbackNo: number
  visitNo: number
  demoUserNo: number
  itemSlug: string
  rating: 1 | 2 | 3 | 4 | 5
  sentiment: Sentiment
  comment: string
  ratedAtIst: string
}

/** The hidden taste profile of a demo user (for tests and analysis only; never exported). */
export type DemoUserProfile = {
  demoUserNo: number
  likedTags: FlavorTagKey[]
  dislikedTag: FlavorTagKey | null
  budgetMaxPaise: number
}

export type DemoFeedbackDataset = {
  visits: DemoVisitRow[]
  ratings: DemoRatingRow[]
  users?: DemoUserProfile[]
}

// ---------------------------------------------------------------- seeded randomness

/** mulberry32: small, fast, well-distributed 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a hash of a string, for per-dish values that do not depend on generation order. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}

class Rng {
  private next: () => number
  constructor(seed: number) {
    this.next = mulberry32(seed)
  }
  float(): number {
    return this.next()
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }
  chance(p: number): boolean {
    return this.next() < p
  }
  /** Standard normal via Box–Muller. */
  normal(mean = 0, sd = 1): number {
    const u = 1 - this.next()
    const v = this.next()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)]
  }
  /** Weighted choice; entries with weight ≤ 0 are never picked. Returns null if none can be. */
  weighted<T>(xs: readonly T[], weight: (x: T) => number): T | null {
    const ws = xs.map((x) => Math.max(0, weight(x)))
    const total = ws.reduce((a, b) => a + b, 0)
    if (total <= 0) return null
    let r = this.next() * total
    for (let i = 0; i < xs.length; i++) {
      r -= ws[i]
      if (r < 0) return xs[i]
    }
    return xs[xs.length - 1]
  }
}

// ---------------------------------------------------------------- spec tables (RECOMMENDATION §3)

const LIKED_TAG_WEIGHTS: [FlavorTagKey, number][] = [
  ['CHEESY', 20],
  ['PERI_PERI', 14],
  ['KOREAN', 12],
  ['SPICY', 12],
  ['COFFEE', 10],
  ['CHOCOLATE', 10],
  ['FRUITY', 8],
  ['ITALIAN', 6],
  ['MEXICAN', 4],
  ['PANEER', 4],
]
const DISLIKED_TAG_WEIGHTS: [FlavorTagKey, number][] = [
  ['SPICY', 40],
  ['COFFEE', 20],
  ['MINTY', 20],
  ['CREAMY', 20],
]
/** Budget per person in paise: [band, share, max]. */
const BUDGETS: [string, number, number][] = [
  ['student', 50, 15_000],
  ['regular', 35, 30_000],
  ['treat', 15, 60_000],
]
const BUDGET_TOLERANCE = 1.1
const VISIT_COUNT_WEIGHTS: [number, number][] = [
  [1, 8],
  [2, 20],
  [3, 25],
  [4, 20],
  [5, 15],
  [6, 12],
]
export const MAX_RATINGS_PER_USER = 12
export const MIN_RATINGS_PER_USER = 2

/** Daypart → [share, first hour, last hour] (IST). */
const DAYPARTS: Record<Daypart, [number, number, number]> = {
  LUNCH: [35, 11, 13],
  AFTERNOON: [30, 14, 16],
  EVENING: [35, 17, 21],
}

type Slot = { cats: string[]; p: number; tag?: FlavorTagKey }
type Pattern = { key: string; slots: Slot[]; weights: Record<Daypart, number> }

const DRINKS_MCI = ['mojito', 'cold-coffee', 'ice-tea']
export const PATTERNS: Pattern[] = [
  {
    key: 'burger-meal',
    slots: [
      { cats: ['burgers'], p: 1 },
      { cats: ['fries'], p: 0.7 },
      { cats: DRINKS_MCI, p: 0.8 },
    ],
    weights: { LUNCH: 14, AFTERNOON: 12, EVENING: 16 },
  },
  {
    key: 'pizza-share',
    slots: [
      { cats: ['pizza'], p: 1 },
      { cats: ['garlic-bread'], p: 0.6 },
      { cats: ['mojito', 'cold-coffee'], p: 0.7 },
    ],
    weights: { LUNCH: 10, AFTERNOON: 8, EVENING: 16 },
  },
  {
    key: 'pasta-plate',
    slots: [
      { cats: ['pasta'], p: 1 },
      { cats: ['garlic-bread'], p: 0.5 },
      { cats: ['mojito', 'ice-tea'], p: 0.6 },
    ],
    weights: { LUNCH: 9, AFTERNOON: 7, EVENING: 9 },
  },
  {
    key: 'momo-snack',
    slots: [
      { cats: ['momos'], p: 1 },
      { cats: ['ice-tea', 'mojito'], p: 0.7 },
    ],
    weights: { LUNCH: 8, AFTERNOON: 11, EVENING: 8 },
  },
  {
    key: 'quick-bite',
    slots: [
      { cats: ['wraps', 'toastie', 'special-buns'], p: 1 },
      { cats: ['fries'], p: 0.4 },
      { cats: ['cold-coffee'], p: 0.5 },
    ],
    weights: { LUNCH: 12, AFTERNOON: 10, EVENING: 6 },
  },
  {
    key: 'maggi-chai',
    slots: [
      { cats: ['maggi'], p: 1 },
      { cats: ['hot-beverages'], p: 0.75 },
    ],
    weights: { LUNCH: 12, AFTERNOON: 10, EVENING: 5 },
  },
  {
    key: 'coffee-break',
    slots: [
      { cats: ['hot-beverages', 'cold-coffee'], p: 1 },
      { cats: ['toastie', 'garlic-bread', 'special-buns'], p: 0.6 },
    ],
    weights: { LUNCH: 12, AFTERNOON: 12, EVENING: 5 },
  },
  {
    key: 'shake-treat',
    slots: [
      { cats: ['milk-shakes'], p: 1 },
      { cats: ['fries', 'nachos'], p: 0.5 },
    ],
    weights: { LUNCH: 5, AFTERNOON: 9, EVENING: 10 },
  },
  {
    key: 'nachos-drinks',
    slots: [
      { cats: ['nachos'], p: 1 },
      { cats: ['fries'], p: 0.6 },
      { cats: ['mojito'], p: 1 },
    ],
    weights: { LUNCH: 3, AFTERNOON: 6, EVENING: 9 },
  },
  {
    key: 'just-a-drink',
    slots: [{ cats: ['mojito', 'ice-tea', 'cold-coffee', 'milk-shakes'], p: 1 }],
    weights: { LUNCH: 12, AFTERNOON: 13, EVENING: 8 },
  },
  {
    key: 'korean-craving',
    slots: [
      { cats: ['burgers', 'pizza', 'toastie', 'special-buns'], p: 1, tag: 'KOREAN' },
      { cats: ['fries'], p: 0.7, tag: 'KOREAN' },
      { cats: ['mojito'], p: 0.7, tag: 'KOREAN' },
    ],
    weights: { LUNCH: 3, AFTERNOON: 2, EVENING: 8 },
  },
]

const NOISE_ADD = 0.1
const NOISE_SWAP = 0.05

// Rating model (§3.5). Base, noise and cut-points are calibrated so the star mix matches the
// team's file within ±3 points (TC-UNIT-132).
export const RATING_MODEL = {
  base: 3.1,
  qualitySd: 0.35,
  bestSellerBoost: 0.25,
  liked: 0.9,
  disliked: -1.2,
  sameTheme: 0.3,
  noiseSd: 0.78,
  cuts: [1.5, 2.5, 3.42, 4.52] as const,
}

/**
 * Score → stars with fixed cut-points (an ordinal model) instead of plain rounding, so the 3★/4★
 * balance can match the team's file (34 % each). A score below cuts[0] is 1★, …, from cuts[3] 5★.
 */
export function toStars(raw: number): DemoRatingRow['rating'] {
  const c = RATING_MODEL.cuts
  return (
    raw < c[0] ? 1 : raw < c[1] ? 2 : raw < c[2] ? 3 : raw < c[3] ? 4 : 5
  ) as DemoRatingRow['rating']
}

// ---------------------------------------------------------------- comments (§3.6)

type CommentGroup = 'FOOD' | 'COLD_DRINK' | 'HOT_DRINK'
const HOT_DRINK_CATEGORIES = new Set(['hot-beverages'])

function commentGroup(item: MenuItemInput): CommentGroup {
  if (item.mealRole !== 'DRINK') return 'FOOD'
  return HOT_DRINK_CATEGORIES.has(item.categorySlug) ? 'HOT_DRINK' : 'COLD_DRINK'
}

// `X` is replaced by the dish name. Group-specific words keep temperatures right: "hot" never
// describes a cold drink and "chilled" never describes food (TC-UNIT-131). No place superlatives.
const OPENERS: Record<Sentiment, Record<CommentGroup | 'ANY', string[]>> = {
  POSITIVE: {
    ANY: [
      'Loved the X, ekdum mast!',
      'X was really tasty.',
      'Great taste, the X was spot on.',
      'Really enjoyed the X.',
      'The X was delicious.',
      'X was full of flavour.',
      'Ordered the X again and it was just as good.',
      'X was a great choice.',
    ],
    FOOD: [
      'X was hot and fresh, superb!',
      'Good portion and great taste, loved the X.',
      'X was well made and filling.',
      'The X came out hot and tasty.',
    ],
    COLD_DRINK: [
      'X was chilled and refreshing.',
      'Perfectly chilled X, loved it.',
      'X was so refreshing on a warm day.',
      'Nice and cool X, just right.',
    ],
    HOT_DRINK: [
      'X was nice and hot, perfect.',
      'A warm cup of X, just right.',
      'X was hot and comforting.',
      'Loved the warm X.',
    ],
  },
  NEUTRAL: {
    ANY: [
      'X was okay, nothing special.',
      'Decent X, but could be a bit tastier.',
      'Average X, expected a little more flavour.',
      'X was fine for the price.',
      'The X was alright.',
      'X was decent, not the best I have had.',
      'X was okay this time.',
      'Not bad, the X was average.',
    ],
    FOOD: [
      'X was fine but could be a little hotter.',
      'Portion of the X was okay.',
      'X was decent, a bit more seasoning would help.',
      'X was average, the taste was mild.',
    ],
    COLD_DRINK: [
      'X was fine, could be a bit colder.',
      'X was okay, a little too sweet for me.',
      'Average X, the flavour was light.',
      'X was decent but not very refreshing.',
    ],
    HOT_DRINK: [
      'X was okay, could be a little hotter.',
      'Average X, the taste was mild.',
      'X was fine, nothing special.',
      'Decent X, a bit too sweet.',
    ],
  },
  NEGATIVE: {
    ANY: [
      'Not happy with the X, will not order again.',
      'X was disappointing.',
      "Didn't like the X, too bland.",
      'X was not worth the price.',
      'The X did not taste good this time.',
      'Expected much better from the X.',
      'X was below average.',
      'Not impressed with the X.',
    ],
    FOOD: [
      'X was cold and the portion was small.',
      'X was soggy, not good.',
      'X was too salty for me.',
      'X was undercooked this time.',
    ],
    COLD_DRINK: [
      'X was not cold enough and too sweet.',
      'X tasted watery.',
      'X was too sweet, could not finish it.',
      'X was warm, not chilled at all.',
    ],
    HOT_DRINK: [
      'X was lukewarm, not hot enough.',
      'X tasted watery.',
      'X was too sweet.',
      'X was bitter this time.',
    ],
  },
}
const CLOSERS: Record<Sentiment, string[]> = {
  POSITIVE: [
    '',
    '',
    ' Great value for money.',
    ' Very affordable too!',
    ' Perfect for hangouts with friends.',
    ' Will order again.',
  ],
  NEUTRAL: [
    '',
    '',
    ' A bit overpriced.',
    ' Okay for a quick bite.',
    ' Might try something else next time.',
  ],
  NEGATIVE: ['', '', ' Slightly expensive.', ' Hope it is better next time.'],
}

function makeComment(rng: Rng, item: MenuItemInput, sentiment: Sentiment): string {
  const pool = [...OPENERS[sentiment].ANY, ...OPENERS[sentiment][commentGroup(item)]]
  const text = rng.pick(pool).replace(/X/g, item.name) + rng.pick(CLOSERS[sentiment])
  return text.slice(0, 200)
}

export function sentimentFor(rating: number): Sentiment {
  return rating >= 4 ? 'POSITIVE' : rating === 3 ? 'NEUTRAL' : 'NEGATIVE'
}

// ---------------------------------------------------------------- dates (IST wall clock)

const START_DAY = Date.UTC(2026, 7, 1) // 2026-08-01
const DAYS = 90 // through 2026-10-29

function istString(dayOffset: number, hour: number, minute: number): string {
  const d = new Date(START_DAY + dayOffset * 86_400_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(hour)}:${p(minute)}:00`
}

/** "YYYY-MM-DD HH:MM:SS" in IST → the UTC instant (IST is UTC+5:30, no daylight saving). */
export function istToDate(ist: string): Date {
  return new Date(`${ist.replace(' ', 'T')}+05:30`)
}

// ---------------------------------------------------------------- generation

type User = {
  no: number
  liked: Set<FlavorTagKey>
  disliked: FlavorTagKey | null
  budgetMax: number
  visits: number
}

function weightedKey<T>(rng: Rng, entries: [T, number][]): T {
  return rng.weighted(entries, (e) => e[1])![0]
}

function makeUser(rng: Rng, no: number): User {
  const liked = new Set<FlavorTagKey>()
  const n = rng.int(1, 3)
  while (liked.size < n) liked.add(weightedKey(rng, LIKED_TAG_WEIGHTS))
  let disliked: FlavorTagKey | null = null
  if (rng.chance(0.5)) {
    const options = DISLIKED_TAG_WEIGHTS.filter(([t]) => !liked.has(t))
    if (options.length) disliked = weightedKey(rng, options)
  }
  const budget = rng.weighted(BUDGETS, (b) => b[1])!
  return {
    no,
    liked,
    disliked,
    budgetMax: budget[2],
    visits: weightedKey(rng, VISIT_COUNT_WEIGHTS),
  }
}

const hasAny = (item: MenuItemInput, tags: Iterable<FlavorTagKey>) => {
  for (const t of tags) if (item.flavorTags.includes(t)) return true
  return false
}

/** Generates the dataset. `items` must already be filtered to published, non-archived dishes. */
export function generateDemoFeedback(
  items: readonly MenuItemInput[],
  opts: { seed?: number; users?: number } = {},
): DemoFeedbackDataset {
  const seed = opts.seed ?? DEFAULT_SEED
  const userCount = opts.users ?? 400
  const rng = new Rng(seed)
  // Stable order, so the input order of `items` does not change the output.
  const menu = [...items].sort((a, b) => a.slug.localeCompare(b.slug))
  const bySlug = new Map(menu.map((i) => [i.slug, i]))

  // Hidden per-dish quality (§3.5): seeded per slug, independent of generation order.
  const quality = new Map(
    menu.map((i) => {
      const r = new Rng(hash(i.slug) ^ seed)
      return [
        i.slug,
        r.normal(0, RATING_MODEL.qualitySd) + (i.isBestSeller ? RATING_MODEL.bestSellerBoost : 0),
      ]
    }),
  )

  type Pending = { user: User; dayOffset: number; hour: number; minute: number; daypart: Daypart }
  const users = Array.from({ length: userCount }, (_, k) => makeUser(rng, k + 1))
  const pending: Pending[] = []
  for (const user of users) {
    for (let v = 0; v < user.visits; v++) {
      const daypart = weightedKey(
        rng,
        (Object.keys(DAYPARTS) as Daypart[]).map((d) => [d, DAYPARTS[d][0]] as [Daypart, number]),
      )
      const [, h0, h1] = DAYPARTS[daypart]
      pending.push({
        user,
        dayOffset: rng.int(0, DAYS - 1),
        hour: rng.int(h0, h1),
        minute: rng.int(0, 59),
        daypart,
      })
    }
  }
  // Chronological visit numbers, ties broken by user number (deterministic).
  pending.sort(
    (a, b) =>
      a.dayOffset - b.dayOffset || a.hour - b.hour || a.minute - b.minute || a.user.no - b.user.no,
  )

  const rated = new Map<number, Set<string>>(users.map((u) => [u.no, new Set()]))
  const visits: DemoVisitRow[] = []
  const draft: Omit<DemoRatingRow, 'feedbackNo'>[] = []

  const fillVisit = (p: Pending, forcePattern?: string): void => {
    const { user, daypart } = p
    const done = rated.get(user.no)!
    if (done.size >= MAX_RATINGS_PER_USER) return
    const pattern =
      PATTERNS.find((x) => x.key === forcePattern) ??
      rng.weighted(
        PATTERNS,
        (x) =>
          x.weights[daypart] * (x.key === 'korean-craving' && user.liked.has('KOREAN') ? 3 : 1),
      )!
    const budget = user.budgetMax * BUDGET_TOLERANCE
    const chosen: MenuItemInput[] = []
    let total = 0

    const candidatesFor = (slot: Slot) =>
      menu.filter(
        (i) =>
          slot.cats.includes(i.categorySlug) &&
          (!slot.tag || i.flavorTags.includes(slot.tag)) &&
          !done.has(i.slug) &&
          !chosen.includes(i),
      )
    const weightFor = (i: MenuItemInput) =>
      (1 + 1.5 * Number(i.isBestSeller) + 0.8 * Number(i.isTrending)) *
      (hasAny(i, user.liked) ? 3 : 1) *
      (user.disliked && i.flavorTags.includes(user.disliked) ? 0.2 : 1) *
      (chosen[0] && hasAny(i, chosen[0].flavorTags) ? 2 : 1)

    for (const [s, slot] of pattern.slots.entries()) {
      if (s > 0 && !rng.chance(slot.p)) continue
      const candidates = candidatesFor(slot)
      if (!candidates.length) continue
      let pick: MenuItemInput | null = null
      for (let attempt = 0; attempt < 5 && !pick; attempt++) {
        const c = rng.weighted(candidates, weightFor)
        if (c && total + c.pricePaise <= budget) pick = c
      }
      // The first dish is the reason for the visit: if nothing fits the budget, take the cheapest.
      if (!pick && s === 0)
        pick = candidates.reduce((a, b) => (b.pricePaise < a.pricePaise ? b : a))
      if (pick) {
        chosen.push(pick)
        total += pick.pricePaise
      }
    }
    if (!chosen.length) return

    // Noise (§3.4): sometimes one extra random dish, sometimes one dish swapped. Both still keep
    // the visit inside the budget.
    if (rng.chance(NOISE_ADD)) {
      const extra = menu.filter(
        (i) => !done.has(i.slug) && !chosen.includes(i) && total + i.pricePaise <= budget,
      )
      if (extra.length) {
        const pick = rng.pick(extra)
        chosen.push(pick)
        total += pick.pricePaise
      }
    }
    if (chosen.length > 1 && rng.chance(NOISE_SWAP)) {
      const idx = rng.int(1, chosen.length - 1)
      const old = chosen[idx]
      const pool = menu.filter(
        (i) =>
          !done.has(i.slug) &&
          !chosen.includes(i) &&
          total - old.pricePaise + i.pricePaise <= budget,
      )
      if (pool.length) {
        chosen[idx] = rng.pick(pool)
        total += chosen[idx].pricePaise - old.pricePaise
      }
    }

    const room = MAX_RATINGS_PER_USER - done.size
    const eaten = chosen.slice(0, room)
    const visitNo = visits.length + 1
    const visitedAtIst = istString(p.dayOffset, p.hour, p.minute)
    visits.push({ visitNo, demoUserNo: user.no, visitedAtIst, daypart, pattern: pattern.key })
    const first = eaten[0]
    for (const [k, item] of eaten.entries()) {
      done.add(item.slug)
      const m = RATING_MODEL
      const raw =
        m.base +
        quality.get(item.slug)! +
        (hasAny(item, user.liked) ? m.liked : 0) +
        (user.disliked && item.flavorTags.includes(user.disliked) ? m.disliked : 0) +
        (k > 0 && hasAny(item, first.flavorTags) ? m.sameTheme : 0) +
        rng.normal(0, m.noiseSd)
      const rating = toStars(raw)
      const sentiment = sentimentFor(rating)
      const minute = Math.min(59, p.minute + k)
      draft.push({
        visitNo,
        demoUserNo: user.no,
        itemSlug: item.slug,
        rating,
        sentiment,
        comment: makeComment(rng, bySlug.get(item.slug)!, sentiment),
        ratedAtIst: istString(p.dayOffset, p.hour, minute),
      })
    }
  }

  for (const p of pending) fillVisit(p)
  // Every demo user rates at least MIN_RATINGS_PER_USER dishes (like the team's file): top up with
  // a "just a drink" visit on the last day if needed.
  for (const user of users) {
    let guard = 0
    while (rated.get(user.no)!.size < MIN_RATINGS_PER_USER && guard++ < 5) {
      const before = visits.length
      fillVisit(
        { user, dayOffset: DAYS - 1, hour: 21, minute: 30 + guard, daypart: 'EVENING' },
        'just-a-drink',
      )
      if (visits.length === before) break
    }
  }

  // Feedback numbers follow time, then visit, then dish (deterministic).
  const ratings = draft
    .map((r, k) => ({ r, k }))
    .sort(
      (a, b) =>
        a.r.ratedAtIst.localeCompare(b.r.ratedAtIst) || a.r.visitNo - b.r.visitNo || a.k - b.k,
    )
    .map(({ r }, n) => ({ feedbackNo: n + 1, ...r }))
  return {
    visits,
    ratings,
    users: users.map((u) => ({
      demoUserNo: u.no,
      likedTags: FLAVOR_ORDER.filter((t) => u.liked.has(t)),
      dislikedTag: u.disliked,
      budgetMaxPaise: u.budgetMax,
    })),
  }
}

// ---------------------------------------------------------------- CSV (the team's format + visit_id, item_slug)

export const FEEDBACK_CSV_HEADER =
  'feedback_id,user_id,visit_id,item_id,item_slug,item_name,rating,comment,sentiment,timestamp'

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * `itemIds` maps slug → the stable numeric item_id (menu order, 1-based). Sentiment is written in
 * lower case, like the team's file.
 */
export function feedbackToCsv(
  dataset: DemoFeedbackDataset,
  items: readonly MenuItemInput[],
  itemIds: Map<string, number>,
): string {
  const names = new Map(items.map((i) => [i.slug, i.name]))
  const lines = [FEEDBACK_CSV_HEADER]
  for (const r of dataset.ratings)
    lines.push(
      [
        r.feedbackNo,
        r.demoUserNo,
        r.visitNo,
        itemIds.get(r.itemSlug) ?? 0,
        r.itemSlug,
        names.get(r.itemSlug) ?? r.itemSlug,
        r.rating,
        r.comment,
        r.sentiment.toLowerCase(),
        r.ratedAtIst,
      ]
        .map(csvCell)
        .join(','),
    )
  return lines.join('\n') + '\n'
}
