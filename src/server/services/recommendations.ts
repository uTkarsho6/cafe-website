import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { formatRupees } from '@/lib/format'
import { daypartAt, flagScore } from '@/lib/reco/engine'
import { PRICE_BANDS } from '@/lib/validation/public'
import {
  FLAVOR_TAG_KEYS,
  FLAVOR_TAGS,
  flavourLabels,
  type BudgetKey,
  type FlavorTagKey,
  type MealRoleKey,
  type SuggestQuery,
} from '@/lib/validation/reco'
import { getDb } from '../db'
import { cardSelect, toCard, type MenuItemCardDto } from './menu'
import { publicItemWhere } from './visibility'

/**
 * Recommendation read path (RECOMMENDATION §4.6–4.7, §6; FR-063…066).
 *
 * - Only published, non-archived, AVAILABLE dishes are ever suggested; the filter runs on every
 *   read, so a sold-out change is reflected as fast as on the menu (≤ 30 s with page caching).
 * - Café-curated links (ItemRelation) come first, then the active model run, then a fallback.
 * - When recommendations are switched off (RecoSettings.enabled = false) the item page shows
 *   curated links only, exactly as before R3.
 * - Reason labels are built from LIVE menu data (meal role, flavour tags, category, admin flags).
 *   They never mention ratings, counts or demo feedback (NFR-014).
 */

export type ReasonCode =
  | 'PAIRS_WITH_ROLE'
  | 'SHARED_TAGS'
  | 'SAME_CATEGORY'
  | 'IN_BUDGET'
  | 'BEST_SELLER'
  | 'TRENDING'
  | 'ADMIN_PICK'
export type RecoReasonDto = { code: ReasonCode; label: string }
export type RecoCardDto = MenuItemCardDto & { reasons: RecoReasonDto[] }
export type ItemRecommendationsDto = { goesWellWith: RecoCardDto[]; youMayAlsoLike: RecoCardDto[] }
export type SuggestionDto = {
  item: RecoCardDto
  /** Display labels of the dish's flavour tags (public menu information, shown as chips; R4). */
  flavours: string[]
  pairWith: RecoCardDto | null
  pairTotalPaise: number | null
  pairTotalLabel: string | null
}

export const SECTION_SIZE = 4
export const SUGGESTION_COUNT = 5
const MAX_PER_CATEGORY = 2

// ---------------------------------------------------------------- rows → parts

function recoSelect(now: Date) {
  return {
    ...cardSelect(now),
    sortOrder: true,
    flavorTags: true,
    category: { select: { slug: true, name: true, mealRole: true } },
  } satisfies Prisma.MenuItemSelect
}
type RecoRow = Prisma.MenuItemGetPayload<{ select: ReturnType<typeof recoSelect> }>

type Dish = {
  id: string
  card: MenuItemCardDto
  tags: FlavorTagKey[]
  role: MealRoleKey
  categorySlug: string
  categoryName: string
  sortOrder: number
}

function toDish(row: RecoRow): Dish {
  // Strip the extra fields before building the public card (DTO rule: explicit fields only).
  const { flavorTags, category, sortOrder, ...rest } = row
  return {
    id: row.id,
    card: toCard({ ...rest, category: { slug: category.slug, name: category.name } }),
    tags: flavorTags,
    role: category.mealRole,
    categorySlug: category.slug,
    categoryName: category.name,
    sortOrder,
  }
}

// ---------------------------------------------------------------- reason labels (§6)

const PROPER_NOUN_TAGS = new Set<FlavorTagKey>(['KOREAN', 'ITALIAN', 'MEXICAN', 'PERI_PERI'])
const tagWord = (t: FlavorTagKey) =>
  PROPER_NOUN_TAGS.has(t) ? FLAVOR_TAGS[t] : FLAVOR_TAGS[t].toLowerCase()
const sharedTags = (a: readonly FlavorTagKey[], b: readonly FlavorTagKey[]) =>
  FLAVOR_TAG_KEYS.filter((t) => a.includes(t) && b.includes(t))
const joinTags = (tags: FlavorTagKey[]) => tags.slice(0, 2).map(tagWord).join(' & ')
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const ROLE_PAIR_LABEL: Record<MealRoleKey, string> = {
  DRINK: 'A drink to go with it',
  SIDE: 'A side to go with it',
  MAIN: 'A main to go with it',
  DESSERT: 'Something sweet after',
}

function flagReason(d: Dish): RecoReasonDto | null {
  if (d.card.isBestSeller) return { code: 'BEST_SELLER', label: 'Best seller' }
  if (d.card.isTrending) return { code: 'TRENDING', label: 'Trending' }
  return null
}

/** Up to two reasons for `to` shown on `from`'s page, from codes validated against live data. */
export function itemReasons(codes: readonly ReasonCode[], from: Dish, to: Dish): RecoReasonDto[] {
  const out: RecoReasonDto[] = []
  for (const code of codes) {
    if (code === 'ADMIN_PICK') out.push({ code, label: 'Café pick' })
    else if (code === 'PAIRS_WITH_ROLE' && to.role !== from.role)
      out.push({ code, label: ROLE_PAIR_LABEL[to.role] })
    else if (code === 'SHARED_TAGS') {
      const shared = sharedTags(from.tags, to.tags)
      if (shared.length) out.push({ code, label: `Also ${joinTags(shared)}` })
    } else if (code === 'SAME_CATEGORY' && to.categorySlug === from.categorySlug)
      out.push({ code, label: `Also in ${to.categoryName}` })
  }
  const flag = flagReason(to)
  if (flag) out.push(flag)
  return out.slice(0, 2)
}

// ---------------------------------------------------------------- item page (FR-063/064)

type Kind = 'COMPLEMENT' | 'SIMILAR'

function fallbackCodes(kind: Kind, from: Dish, to: Dish): ReasonCode[] {
  const shared = sharedTags(from.tags, to.tags).length > 0
  if (kind === 'COMPLEMENT')
    return shared ? ['PAIRS_WITH_ROLE', 'SHARED_TAGS'] : ['PAIRS_WITH_ROLE']
  return shared ? ['SHARED_TAGS'] : to.categorySlug === from.categorySlug ? ['SAME_CATEGORY'] : []
}

/** `null` when the dish does not exist or is not public. At most 4 queries, no N+1. */
export async function getItemRecommendations(
  slug: string,
  now = new Date(),
): Promise<ItemRecommendationsDto | null> {
  const db = getDb()
  const visibleAvailable: Prisma.MenuItemWhereInput = {
    AND: [publicItemWhere, { isAvailable: true }],
  }
  const row = await db.menuItem.findFirst({
    where: { AND: [publicItemWhere, { slug }] },
    select: {
      ...recoSelect(now),
      relationsFrom: {
        where: { toItem: visibleAvailable },
        orderBy: { sortOrder: 'asc' },
        select: { type: true, toItem: { select: recoSelect(now) } },
      },
    },
  })
  if (!row) return null
  const { relationsFrom, ...self } = row
  const from = toDish(self)
  const used = new Set([from.id])
  const sections: Record<Kind, RecoCardDto[]> = { COMPLEMENT: [], SIMILAR: [] }
  const add = (kind: Kind, to: Dish, codes: readonly ReasonCode[]) => {
    if (used.has(to.id) || sections[kind].length >= SECTION_SIZE) return
    used.add(to.id)
    sections[kind].push({ ...to.card, reasons: itemReasons(codes, from, to) })
  }

  // 1. Café-curated links (FR-012 keeps working, and they always come first).
  for (const rel of relationsFrom)
    add(rel.type === 'FREQUENTLY_BOUGHT_TOGETHER' ? 'COMPLEMENT' : 'SIMILAR', toDish(rel.toItem), [
      'ADMIN_PICK',
    ])

  const settings = await db.recoSettings.findUnique({
    where: { id: 'reco' },
    select: { enabled: true, activeRunId: true },
  })
  if (settings?.enabled && settings.activeRunId) {
    // 2. The active model run (top 10 stored, so read-time filtering still leaves enough).
    const recs = await db.itemRecommendation.findMany({
      where: { runId: settings.activeRunId, fromItemId: from.id, toItem: visibleAvailable },
      orderBy: [{ kind: 'asc' }, { rank: 'asc' }],
      select: { kind: true, reasons: true, toItem: { select: recoSelect(now) } },
    })
    for (const r of recs) add(r.kind, toDish(r.toItem), r.reasons)

    // 3. Fallback (§4.7): other-role / same-role best sellers, then same category, by menu order.
    if (sections.COMPLEMENT.length < SECTION_SIZE || sections.SIMILAR.length < SECTION_SIZE) {
      const pool = (
        await db.menuItem.findMany({
          where: { AND: [visibleAvailable, { id: { notIn: [...used] } }] },
          select: recoSelect(now),
          orderBy: [
            { isBestSeller: 'desc' },
            { isTrending: 'desc' },
            { sortOrder: 'asc' },
            { slug: 'asc' },
          ],
          take: 200,
        })
      ).map(toDish)
      for (const d of pool.filter((d) => d.role !== from.role))
        add('COMPLEMENT', d, fallbackCodes('COMPLEMENT', from, d))
      const sameRole = pool.filter((d) => d.role === from.role)
      const sameCatFirst = [
        ...sameRole.filter((d) => d.card.isBestSeller || d.card.isTrending),
        ...sameRole.filter(
          (d) =>
            !(d.card.isBestSeller || d.card.isTrending) && d.categorySlug === from.categorySlug,
        ),
      ]
      for (const d of sameCatFirst) add('SIMILAR', d, fallbackCodes('SIMILAR', from, d))
    }
  }
  return { goesWellWith: sections.COMPLEMENT, youMayAlsoLike: sections.SIMILAR }
}

// ---------------------------------------------------------------- Help me choose (FR-065)

function moodWhere(mood: SuggestQuery['mood']): Prisma.MenuItemWhereInput {
  if (mood === 'meal') return { category: { mealRole: 'MAIN' } }
  if (mood === 'snack') return { category: { mealRole: 'SIDE' } }
  if (mood === 'drink') return { category: { mealRole: 'DRINK' } }
  return {
    OR: [
      { category: { mealRole: 'DESSERT' } },
      { flavorTags: { hasSome: ['CHOCOLATE', 'FRUITY', 'CREAMY'] } },
    ],
  }
}

function budgetWhere(budget: BudgetKey): Prisma.MenuItemWhereInput {
  if (budget === 'under-100')
    return { pricePaise: { lt: PRICE_BANDS['under-100'].maxPaiseExclusive } }
  if (budget === '100-200')
    return {
      pricePaise: { gte: PRICE_BANDS['100-200'].minPaise, lte: PRICE_BANDS['100-200'].maxPaise },
    }
  if (budget === '200-plus')
    return { pricePaise: { gt: PRICE_BANDS['200-plus'].minPaiseExclusive } }
  return {}
}

/** Largest pair total allowed by the budget band (null = no limit). */
function budgetCap(budget: BudgetKey): { max: number; inclusive: boolean } | null {
  if (budget === 'under-100')
    return { max: PRICE_BANDS['under-100'].maxPaiseExclusive, inclusive: false }
  if (budget === '100-200') return { max: PRICE_BANDS['100-200'].maxPaise, inclusive: true }
  return null
}

/** 5 available dishes for the guest's answers, with reasons; for "meal", each main gets a pairing. */
export async function getSuggestions(
  query: SuggestQuery,
  now = new Date(),
): Promise<SuggestionDto[]> {
  const db = getDb()
  const rows = await db.menuItem.findMany({
    where: {
      AND: [
        publicItemWhere,
        { isAvailable: true },
        moodWhere(query.mood),
        budgetWhere(query.budget),
      ],
    },
    select: recoSelect(now),
  })
  const dishes = rows.map(toDish)
  const settings = await db.recoSettings.findUnique({
    where: { id: 'reco' },
    select: { activeRunId: true },
  })
  const runId = settings?.activeRunId ?? null
  const popularity = new Map<string, number>()
  if (runId && dishes.length) {
    const pops = await db.itemPopularity.findMany({
      where: { runId, window: daypartAt(now), menuItemId: { in: dishes.map((d) => d.id) } },
      select: { menuItemId: true, score: true },
    })
    for (const p of pops) popularity.set(p.menuItemId, p.score)
  }
  // §4.6 (revised in R3, ADR-074): dishes with more of the chosen flavours always come first
  // (a guest who asks for "spicy" gets spicy dishes first); within the same match, daypart quality
  // (0.35) and admin flags (0.20) decide.
  const matchShare = (d: Dish) =>
    query.tags.length ? sharedTags(query.tags, d.tags).length / query.tags.length : 0
  const quality = (d: Dish) => (0.35 * (popularity.get(d.id) ?? 0) + 0.2 * flagScore(d.card)) / 0.55
  // Chosen flavours are a requirement, not only a preference (R5b fix, ADR-077): a dish must have
  // at least one of them. Otherwise "meal + minty" listed non-minty best sellers; now it shows the
  // "Nothing matches" state with "Remove flavours".
  const ranked = dishes
    .map((d) => ({ d, m: matchShare(d), q: quality(d) }))
    .filter((x) => query.tags.length === 0 || x.m > 0)
    .sort(
      (a, b) =>
        b.m - a.m ||
        b.q - a.q ||
        a.d.sortOrder - b.d.sortOrder ||
        (a.d.card.slug < b.d.card.slug ? -1 : 1),
    )
  const chosen: Dish[] = []
  const perCat = new Map<string, number>()
  for (const { d } of ranked) {
    if (chosen.length >= SUGGESTION_COUNT) break
    if ((perCat.get(d.categorySlug) ?? 0) >= MAX_PER_CATEGORY) continue
    chosen.push(d)
    perCat.set(d.categorySlug, (perCat.get(d.categorySlug) ?? 0) + 1)
  }

  const reasons = (d: Dish): RecoReasonDto[] => {
    const out: RecoReasonDto[] = []
    const shared = sharedTags(query.tags, d.tags)
    if (shared.length) out.push({ code: 'SHARED_TAGS', label: capitalise(joinTags(shared)) })
    if (query.budget !== 'any')
      out.push({ code: 'IN_BUDGET', label: PRICE_BANDS[query.budget].label })
    const flag = flagReason(d)
    if (flag) out.push(flag)
    return out.slice(0, 2)
  }

  // Pairings for "a meal": the main's first available COMPLEMENT that keeps the total in budget.
  const pairs = new Map<string, Dish>()
  if (query.mood === 'meal' && runId && chosen.length) {
    const recs = await db.itemRecommendation.findMany({
      where: {
        runId,
        kind: 'COMPLEMENT',
        fromItemId: { in: chosen.map((d) => d.id) },
        toItem: { AND: [publicItemWhere, { isAvailable: true }] },
      },
      orderBy: [{ fromItemId: 'asc' }, { rank: 'asc' }],
      select: { fromItemId: true, toItem: { select: recoSelect(now) } },
    })
    const cap = budgetCap(query.budget)
    for (const main of chosen)
      for (const r of recs.filter((x) => x.fromItemId === main.id)) {
        const side = toDish(r.toItem)
        const total = main.card.pricePaise + side.card.pricePaise
        if (cap && (cap.inclusive ? total > cap.max : total >= cap.max)) continue
        pairs.set(main.id, side)
        break
      }
  }

  return chosen.map((d) => {
    const pair = pairs.get(d.id) ?? null
    const total = pair ? d.card.pricePaise + pair.card.pricePaise : null
    return {
      item: { ...d.card, reasons: reasons(d) },
      flavours: flavourLabels(d.tags),
      pairWith: pair
        ? {
            ...pair.card,
            reasons: [{ code: 'PAIRS_WITH_ROLE', label: ROLE_PAIR_LABEL[pair.role] }],
          }
        : null,
      pairTotalPaise: total,
      pairTotalLabel: total === null ? null : formatRupees(total),
    }
  })
}
