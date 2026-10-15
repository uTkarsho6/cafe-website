import { z } from 'zod'
import { cleanText } from './public'

/**
 * Input schemas for menu administration (Phase 5B, TRD §6.3). Shared by Server Actions and
 * tests; no server imports. Every schema lists the fields an admin may set: anything else in the
 * form (id, slug, isDemo, createdAt, …) is dropped, never written (mass-assignment protection).
 */

export const MAX_PRICE_PAISE = 10_000_000 // ₹1,00,000: far above any café price, catches typos

/** "149", "149.5" or "149.50" rupees → integer paise. Rejects negatives and >2 decimals. */
export function rupeesToPaise(value: string): number | null {
  const v = value.trim()
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(v)) return null
  const [whole, frac = ''] = v.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

export function paiseToRupeesInput(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2)
}

/** Lower-case ASCII slug for public URLs ("Paneer Tikka Pizza!" → "paneer-tikka-pizza"). */
export function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'item'
  )
}

const text = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required.` })
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(
          min,
          min === 1 ? `${label} is required.` : `${label} needs at least ${min} characters.`,
        )
        .max(max, `${label} can be at most ${max} characters.`),
    )

const optionalText = (max: number, label: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? null : cleanText(v) || null))
    .pipe(z.string().max(max, `${label} can be at most ${max} characters.`).nullable())

const price = (label: string, min = 0) =>
  z
    .string({ error: `${label} is required.` })
    .transform((v, ctx) => {
      const paise = rupeesToPaise(v)
      if (paise === null) {
        ctx.addIssue({ code: 'custom', message: `${label}: enter rupees, e.g. 149 or 149.50.` })
        return z.NEVER
      }
      return paise
    })
    .pipe(
      z
        .number()
        .int()
        .min(min, `${label} must be more than ₹0.`)
        .max(MAX_PRICE_PAISE, `${label} is too high.`),
    )

/** HTML checkboxes send "on" when ticked and nothing when not. */
const checkbox = z
  .union([z.literal('on'), z.literal('true'), z.literal('false')])
  .optional()
  .transform((v) => v === 'on' || v === 'true')

const sortOrder = z.coerce
  .number({ error: 'Sort order must be a number.' })
  .int('Sort order must be a whole number.')
  .min(0, 'Sort order cannot be negative.')
  .max(9999, 'Sort order can be at most 9999.')
  .default(0)

export const idSchema = z.string().regex(/^[a-z0-9]{20,40}$/, 'Invalid ID.')

export const CATEGORY_ICONS = [
  'BURGER',
  'PIZZA',
  'PASTA',
  'SNACKS',
  'SANDWICH',
  'BEVERAGE',
  'COFFEE',
  'DESSERT',
  'MEAL',
  'GENERAL',
] as const

export const DIET_TYPES = ['VEG', 'NON_VEG', 'EGG'] as const

export const categoryInputSchema = z
  .object({
    name: text(2, 60, 'Name'),
    description: optionalText(200, 'Description'),
    iconKey: z.enum(CATEGORY_ICONS, { error: 'Choose an icon.' }),
    sortOrder,
  })
  .strip()
export type CategoryInput = z.infer<typeof categoryInputSchema>

export const itemInputSchema = z
  .object({
    name: text(2, 80, 'Name'),
    description: text(10, 600, 'Description'),
    price: price('Price', 1), // MenuItem_price_range CHECK: > 0
    categoryId: z
      .string({ error: 'Choose a category.' })
      .regex(/^[a-z0-9]{20,40}$/, 'Choose a category.'),
    dietType: z.enum(DIET_TYPES, { error: 'Choose veg, egg or non-veg.' }),
    isAvailable: checkbox,
    isPublished: checkbox,
    isBestSeller: checkbox,
    isTrending: checkbox,
    isFeatured: checkbox,
    sortOrder,
  })
  .strip()
export type ItemInput = z.infer<typeof itemInputSchema>

/** Add-ons are edited as a list in the browser and submitted as one JSON field. */
export const addOnGroupsSchema = z
  .array(
    z
      .object({
        name: text(1, 60, 'Group name'),
        minSelect: z.number().int().min(0).max(20),
        maxSelect: z.number().int().min(1).max(20),
        options: z
          .array(
            z
              .object({
                name: text(1, 60, 'Option name'),
                price: price('Option price'),
                isAvailable: z.boolean(),
              })
              .strict(),
          )
          .min(1, 'Each group needs at least one option.')
          .max(20, 'A group can have at most 20 options.'),
      })
      .strict()
      .superRefine((g, ctx) => {
        if (g.minSelect > g.maxSelect)
          ctx.addIssue({ code: 'custom', message: `"${g.name}": minimum is above maximum.` })
        if (g.minSelect > g.options.length)
          ctx.addIssue({
            code: 'custom',
            message: `"${g.name}": minimum is above the number of options.`,
          })
      }),
  )
  .max(10, 'An item can have at most 10 add-on groups.')
export type AddOnGroupsInput = z.infer<typeof addOnGroupsSchema>

export const MAX_RELATIONS = 8

export const relationsSchema = z
  .object({
    related: z.array(idSchema).max(MAX_RELATIONS, `Pick at most ${MAX_RELATIONS} related items.`),
    together: z
      .array(idSchema)
      .max(MAX_RELATIONS, `Pick at most ${MAX_RELATIONS} "bought together" items.`),
  })
  .strict()
export type RelationsInput = z.infer<typeof relationsSchema>

export const imageAltSchema = text(5, 150, 'Alt text')

/** Admin menu list filters (query string). Invalid values fall back to defaults. */
export const adminItemQuerySchema = z.object({
  q: z
    .string()
    .optional()
    .transform((v) => (v ? cleanText(v).slice(0, 80) : undefined))
    .catch(undefined),
  category: idSchema.optional().catch(undefined),
  status: z.enum(['all', 'available', 'unavailable', 'hidden', 'archived']).catch('all'),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
})
export type AdminItemQuery = z.infer<typeof adminItemQuerySchema>

/** First message per field, for showing errors next to form controls. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    out[key] ??= issue.message
  }
  return out
}
