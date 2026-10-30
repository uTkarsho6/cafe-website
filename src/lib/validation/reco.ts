import { z } from 'zod'
import './zod-setup'

/**
 * Recommendation inputs shared by admin forms and server code (RECOMMENDATION §2, ADR-069).
 * The keys match the Prisma enums `FlavorTag` and `MealRole` (checked in TC-UNIT-134).
 */

/** Flavour tags in display order. Labels describe the dish; they are not dietary claims. */
export const FLAVOR_TAGS = {
  SPICY: 'Spicy',
  CHEESY: 'Cheesy',
  KOREAN: 'Korean',
  PERI_PERI: 'Peri Peri',
  ITALIAN: 'Italian',
  MEXICAN: 'Mexican',
  SMOKY: 'Barbeque',
  PANEER: 'Paneer',
  CREAMY: 'Creamy',
  FRUITY: 'Fruity',
  CHOCOLATE: 'Chocolate',
  COFFEE: 'Coffee',
  MINTY: 'Minty',
} as const
export type FlavorTagKey = keyof typeof FLAVOR_TAGS
export const FLAVOR_TAG_KEYS = Object.keys(FLAVOR_TAGS) as FlavorTagKey[]
export const MAX_FLAVOR_TAGS = 5

/** Display labels for stored tags, canonical order, unknown values dropped. */
export const flavourLabels = (tags: readonly string[]): string[] =>
  FLAVOR_TAG_KEYS.filter((k) => tags.includes(k)).map((k) => FLAVOR_TAGS[k])

export const MEAL_ROLES = {
  MAIN: 'Main',
  SIDE: 'Side',
  DRINK: 'Drink',
  DESSERT: 'Dessert',
} as const
export type MealRoleKey = keyof typeof MEAL_ROLES
export const MEAL_ROLE_KEYS = Object.keys(MEAL_ROLES) as MealRoleKey[]

const TAG_ERROR = 'Please choose flavour tags from the list.'

/** Known keys only, duplicates dropped, canonical order, at most 5 (the DB CHECK agrees). */
export const flavorTagsSchema = z
  .array(z.enum(FLAVOR_TAG_KEYS, { error: TAG_ERROR }), { error: TAG_ERROR })
  .transform((v) => FLAVOR_TAG_KEYS.filter((k) => v.includes(k)))
  .refine((v) => v.length <= MAX_FLAVOR_TAGS, `Choose at most ${MAX_FLAVOR_TAGS} flavour tags.`)

export const mealRoleSchema = z.enum(MEAL_ROLE_KEYS, { error: 'Please choose a meal role.' })

// ---------------------------------------------------------------- Help me choose (RECOMMENDATION §4.6)

export const MOODS = {
  meal: 'A meal',
  snack: 'A snack',
  drink: 'A drink',
  sweet: 'Something sweet',
} as const
export type MoodKey = keyof typeof MOODS
export const MOOD_KEYS = Object.keys(MOODS) as MoodKey[]

/** Budget per person: the menu's price bands plus "any" (ADR-022). */
export const BUDGET_KEYS = ['any', 'under-100', '100-200', '200-plus'] as const
export type BudgetKey = (typeof BUDGET_KEYS)[number]
export const MAX_CHOOSE_TAGS = 3

/**
 * Query for /api/v1/recommendations/suggest and /help-me-choose. Only fixed values are accepted,
 * so the set of possible queries (and cache keys) is finite. Unknown params are ignored.
 */
export const suggestQuerySchema = z.object({
  mood: z.enum(MOOD_KEYS, { error: 'Choose a mood: meal, snack, drink or sweet.' }),
  budget: z.preprocess(
    (v) => (v === '' || v === undefined ? 'any' : v),
    z.enum(BUDGET_KEYS, { error: 'Choose a budget from the list.' }),
  ),
  tags: z.preprocess(
    (v) =>
      typeof v === 'string'
        ? v
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : (v ?? []),
    z
      .array(z.enum(FLAVOR_TAG_KEYS, { error: TAG_ERROR }), { error: TAG_ERROR })
      .max(MAX_CHOOSE_TAGS * 4, TAG_ERROR) // bounds the work before de-duplication
      .transform((v) => FLAVOR_TAG_KEYS.filter((k) => v.includes(k)))
      .refine((v) => v.length <= MAX_CHOOSE_TAGS, `Choose at most ${MAX_CHOOSE_TAGS} flavours.`),
  ),
})
export type SuggestQuery = z.infer<typeof suggestQuerySchema>

// ---------------------------------------------------------------- admin weights (FR-067, R5)

const weight = (label: string) =>
  z.coerce
    .number({ error: `${label}: enter a whole number from 0 to 1000.` })
    .int(`${label}: enter a whole number from 0 to 1000.`)
    .min(0, `${label}: enter a whole number from 0 to 1000.`)
    .max(1000, `${label}: enter a whole number from 0 to 1000.`)

/**
 * The six blend weights in per-mille (RECOMMENDATION §4.4). They are normalised when training, so
 * only their ratio matters; each list needs at least one weight above 0. Unknown fields (status,
 * activeRunId, dataSource, …) are dropped, never written (mass assignment, TC-SEC-134).
 */
export const recoWeightsSchema = z
  .object({
    compCoocPm: weight('Co-occurrence'),
    compQualityPm: weight('Quality'),
    compContentPm: weight('Content'),
    simContentPm: weight('Content'),
    simTastePm: weight('Taste'),
    simQualityPm: weight('Quality'),
  })
  .strip()
  .superRefine((w, ctx) => {
    if (w.compCoocPm + w.compQualityPm + w.compContentPm === 0)
      ctx.addIssue({
        code: 'custom',
        path: ['compCoocPm'],
        message: '"Goes well with" needs at least one weight above 0.',
      })
    if (w.simContentPm + w.simTastePm + w.simQualityPm === 0)
      ctx.addIssue({
        code: 'custom',
        path: ['simContentPm'],
        message: '"You may also like" needs at least one weight above 0.',
      })
  })
export type RecoWeights = z.infer<typeof recoWeightsSchema>
