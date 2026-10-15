import { z } from 'zod'
import { MAX_PRICE_PAISE, idSchema, rupeesToPaise } from './admin-menu'
import { cleanText } from './public'

/**
 * Input schemas for offers, banners, café information, opening hours and gallery (Phase 5C,
 * ADR-050). No server imports. As in admin-menu.ts, only listed fields are kept: anything else
 * in a form (id, slug, isDemo, expiredAt, …) is dropped, never written.
 */

// ── Shared field helpers ─────────────────────────────────────────────────────

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

/** Optional text: empty → null. Line breaks are kept for longer texts (about, terms). */
const optionalText = (max: number, label: string, multiline = false) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined) return null
      const cleaned = multiline
        ? v
            .replace(/\r\n?/g, '\n')
            .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
        : cleanText(v)
      return cleaned || null
    })
    .pipe(z.string().max(max, `${label} can be at most ${max} characters.`).nullable())

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

// ── Dates (admins type India time) ───────────────────────────────────────────

const IST_OFFSET_MIN = 330

/** "2026-10-16T18:30" typed in a datetime-local field, read as India time (IST, UTC+5:30). */
export function parseIstDateTime(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number]
  const utc = Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MIN * 60_000
  const date = new Date(utc)
  // Rejects impossible dates such as 2026-02-31 (Date.UTC would roll them over).
  const back = new Date(utc + IST_OFFSET_MIN * 60_000)
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null
  return date
}

/** Date → "YYYY-MM-DDTHH:MM" in India time, for datetime-local inputs. */
export function toIstInput(date: Date | string | null | undefined): string {
  if (!date) return ''
  const shifted = new Date(new Date(date).getTime() + IST_OFFSET_MIN * 60_000)
  return shifted.toISOString().slice(0, 16)
}

const MIN_YEAR = 2024
const MAX_YEAR = 2100
const dateTime = (label: string) =>
  z.string({ error: `${label} is required.` }).transform((v, ctx) => {
    const d = parseIstDateTime(v)
    if (!d || d.getUTCFullYear() < MIN_YEAR || d.getUTCFullYear() > MAX_YEAR) {
      ctx.addIssue({ code: 'custom', message: `${label}: choose a valid date and time.` })
      return z.NEVER
    }
    return d
  })
const optionalDateTime = (label: string) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v?.trim()) return null
      const d = parseIstDateTime(v)
      if (!d || d.getUTCFullYear() < MIN_YEAR || d.getUTCFullYear() > MAX_YEAR) {
        ctx.addIssue({ code: 'custom', message: `${label}: choose a valid date and time.` })
        return z.NEVER
      }
      return d
    })

// ── Links ────────────────────────────────────────────────────────────────────

/**
 * Safe link target (CLAUDE.md §4.4, §9.5): an internal path ("/offers", "/menu?category=pizza")
 * or an absolute http(s) URL. Rejects javascript:, data:, protocol-relative "//evil", backslash
 * tricks, credentials in the URL and control characters.
 */
export function isSafeHref(value: string): boolean {
  const v = value.trim()
  if (!v || v.length > 300 || /[\u0000-\u001F\u007F\s\\]/.test(v)) return false
  if (v.startsWith('/')) return !v.startsWith('//') && URL.canParse(v, 'https://x.invalid')
  if (!URL.canParse(v)) return false
  const url = new URL(v)
  return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
}

const SOCIAL_HOSTS = {
  instagram: ['instagram.com', 'www.instagram.com'],
  facebook: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'www.fb.com'],
} as const

/** https URL on the given social network's own domain (TC-UNIT-041). */
export function isSocialUrl(value: string, network: keyof typeof SOCIAL_HOSTS): boolean {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    (SOCIAL_HOSTS[network] as readonly string[]).includes(url.hostname) &&
    url.pathname.length > 1
  )
}

const optionalUrl = (label: string, check: (v: string) => boolean, hint: string) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      const t = v?.trim()
      if (!t) return null
      if (t.length > 300 || !check(t)) {
        ctx.addIssue({ code: 'custom', message: `${label}: ${hint}` })
        return z.NEVER
      }
      return t
    })

// ── Offers ───────────────────────────────────────────────────────────────────

export const OFFER_KINDS = ['DISCOUNT', 'COMBO', 'INFO'] as const
export const MAX_OFFER_ITEMS = 10

export const offerInputSchema = z
  .object({
    kind: z.enum(OFFER_KINDS, { error: 'Choose the offer type.' }),
    title: text(3, 80, 'Title'),
    description: text(10, 600, 'Description'),
    promoPrice: z.string().optional(),
    startsAt: dateTime('Starts'),
    endsAt: dateTime('Ends'),
    isPublished: checkbox,
    isStudentOffer: checkbox,
    isFeatured: checkbox,
    sortOrder,
    items: z
      .array(z.object({ menuItemId: idSchema, quantity: z.number().int().min(1).max(20) }).strict())
      .max(MAX_OFFER_ITEMS, `An offer can include at most ${MAX_OFFER_ITEMS} items.`)
      .default([]),
  })
  .strip()
  .transform((v, ctx) => {
    // Mirrors the Offer_price_matches_kind CHECK: INFO has no price; others need one > 0.
    const raw = v.promoPrice?.trim() ?? ''
    let promoPricePaise: number | null = null
    if (v.kind === 'INFO') {
      if (raw)
        ctx.addIssue({
          code: 'custom',
          path: ['promoPrice'],
          message: 'Information offers have no price: leave it empty.',
        })
    } else {
      const paise = raw ? rupeesToPaise(raw) : null
      if (paise === null || paise < 1 || paise > MAX_PRICE_PAISE)
        ctx.addIssue({
          code: 'custom',
          path: ['promoPrice'],
          message: 'Offer price: enter rupees above ₹0, e.g. 199.',
        })
      else promoPricePaise = paise
    }
    if (v.endsAt <= v.startsAt)
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Ends must be after Starts.' })
    if (v.kind === 'COMBO' && v.items.length === 0)
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'A combo needs at least one menu item.',
      })
    if (new Set(v.items.map((i) => i.menuItemId)).size !== v.items.length)
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Each item can be added once.' })
    const { promoPrice, ...rest } = v
    void promoPrice // replaced by promoPricePaise
    return { ...rest, promoPricePaise }
  })
export type OfferInput = z.infer<typeof offerInputSchema>

/** Items picked in the offer form: fields named `qty_<itemId>` with a quantity (0 = not included). */
export function offerItemsFromForm(form: Iterable<[string, FormDataEntryValue]>) {
  const items: { menuItemId: string; quantity: number }[] = []
  for (const [key, value] of form) {
    if (!key.startsWith('qty_') || typeof value !== 'string' || !value.trim()) continue
    const quantity = Number(value)
    if (quantity === 0) continue
    items.push({ menuItemId: key.slice(4), quantity })
  }
  return items
}

// ── Banners ──────────────────────────────────────────────────────────────────

export const bannerInputSchema = z
  .object({
    title: text(3, 80, 'Title'),
    subtitle: optionalText(160, 'Subtitle'),
    altText: text(5, 150, 'Image description'),
    ctaLabel: optionalText(30, 'Button text'),
    ctaHref: optionalUrl(
      'Button link',
      isSafeHref,
      'use a page of this site (e.g. /offers) or an https:// address.',
    ),
    startsAt: optionalDateTime('Show from'),
    endsAt: optionalDateTime('Show until'),
    isPublished: checkbox,
    sortOrder,
  })
  .strip()
  .superRefine((v, ctx) => {
    if (Boolean(v.ctaLabel) !== Boolean(v.ctaHref))
      ctx.addIssue({
        code: 'custom',
        path: [v.ctaLabel ? 'ctaHref' : 'ctaLabel'],
        message: 'Fill in both the button text and the button link, or neither.',
      })
    if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt)
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: '"Show until" must be after "Show from".',
      })
  })
export type BannerInput = z.infer<typeof bannerInputSchema>

// ── Café information ─────────────────────────────────────────────────────────

const coordinate = (label: string, limit: number) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      const t = v?.trim()
      if (!t) return null
      const n = Number(t)
      if (!/^-?\d{1,3}(\.\d{1,6})?$/.test(t) || !Number.isFinite(n) || Math.abs(n) > limit) {
        ctx.addIssue({
          code: 'custom',
          message: `${label}: a number between -${limit} and ${limit} (up to 6 decimals).`,
        })
        return z.NEVER
      }
      return n
    })

export const cafeInputSchema = z
  .object({
    name: text(2, 80, 'Café name'),
    addressLine: text(5, 200, 'Address'),
    city: text(2, 60, 'City'),
    postalCode: optionalText(10, 'PIN code').refine(
      (v) => v === null || /^\d{6}$/.test(v),
      'PIN code: 6 digits.',
    ),
    phone: optionalText(20, 'Phone').refine(
      (v) => v === null || /^\+?[0-9 -]{8,19}$/.test(v),
      'Phone: digits, spaces, dashes and an optional leading +.',
    ),
    email: optionalText(120, 'Email').refine(
      (v) => v === null || z.email().safeParse(v).success,
      'Email: enter a valid address.',
    ),
    whatsappNumber: optionalText(15, 'WhatsApp number').refine(
      (v) => v === null || /^[0-9]{8,15}$/.test(v),
      'WhatsApp: digits only with country code, e.g. 919876543210.',
    ),
    instagramUrl: optionalUrl(
      'Instagram',
      (v) => isSocialUrl(v, 'instagram'),
      'an https://instagram.com/… link.',
    ),
    facebookUrl: optionalUrl(
      'Facebook',
      (v) => isSocialUrl(v, 'facebook'),
      'an https://facebook.com/… link.',
    ),
    latitude: coordinate('Latitude', 90),
    longitude: coordinate('Longitude', 180),
    mapsQuery: optionalText(200, 'Google Maps place'),
    aboutText: optionalText(1000, 'About text', true),
    studentZoneText: optionalText(1000, 'Student Zone text', true),
    offerTerms: optionalText(1000, 'Offer terms', true),
    isPureVegConfirmed: checkbox,
    addressVerified: checkbox,
    contactVerified: checkbox,
    hoursVerified: checkbox,
    mapVerified: checkbox,
    socialVerified: checkbox,
  })
  .strip()
  .superRefine((v, ctx) => {
    if ((v.latitude === null) !== (v.longitude === null))
      ctx.addIssue({
        code: 'custom',
        path: [v.latitude === null ? 'latitude' : 'longitude'],
        message: 'Enter both latitude and longitude, or neither.',
      })
  })
export type CafeInput = z.infer<typeof cafeInputSchema>

// ── Opening hours ────────────────────────────────────────────────────────────

/** "HH:MM" → minutes from midnight; "24:00" allowed only as a closing time. */
export function hhmmToMinutes(value: string, allowMidnightEnd = false): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (min > 59) return null
  if (h === 24 && min === 0 && allowMidnightEnd) return 1440
  if (h > 23) return null
  return h * 60 + min
}

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/** Reads `closed_<d>`, `opens_<d>`, `closes_<d>` for d = 0 (Sunday) … 6 and validates each day. */
export function parseHoursForm(form: FormData) {
  const days: { dayOfWeek: number; isClosed: boolean; opensAtMin: number; closesAtMin: number }[] =
    []
  const errors: Record<string, string> = {}
  for (let d = 0; d < 7; d++) {
    const isClosed = form.get(`closed_${d}`) === 'on'
    if (isClosed) {
      days.push({ dayOfWeek: d, isClosed, opensAtMin: 0, closesAtMin: 0 })
      continue
    }
    const opens = hhmmToMinutes(String(form.get(`opens_${d}`) ?? ''))
    const rawCloses = hhmmToMinutes(String(form.get(`closes_${d}`) ?? ''), true)
    // A time picker cannot show 24:00, so closing at "00:00" means midnight (end of the day).
    const closes = rawCloses === 0 ? 1440 : rawCloses
    if (opens === null || closes === null)
      errors[`day_${d}`] = `${DAY_NAMES[d]}: enter opening and closing times.`
    // Mirrors OpeningHours_time_range: closing after opening, same day (past midnight: Q-05).
    else if (closes <= opens)
      errors[`day_${d}`] = `${DAY_NAMES[d]}: closing time must be after opening time (same day).`
    else days.push({ dayOfWeek: d, isClosed, opensAtMin: opens, closesAtMin: closes })
  }
  return Object.keys(errors).length > 0
    ? { ok: false as const, errors }
    : { ok: true as const, days }
}

// ── Gallery ──────────────────────────────────────────────────────────────────

export const galleryInputSchema = z
  .object({
    altText: text(5, 150, 'Alt text'),
    caption: optionalText(120, 'Caption'),
    isPublished: checkbox,
  })
  .strip()
export type GalleryInput = z.infer<typeof galleryInputSchema>
