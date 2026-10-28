import { z } from 'zod'
import './zod-setup'

/**
 * Public feedback form (FR-019, ADR-026). Only a message and an optional display name: no email,
 * phone or rating. `website` is a honeypot: humans never see it, bots fill it in.
 */
export const FEEDBACK_MIN = 10
export const FEEDBACK_MAX = 1000

/**
 * Quick highlights (Round 2D, ADR-062): a fixed list the guest can tick; stored as an enum array,
 * so only these values can ever be saved. Labels are the guest's opinion, not café claims.
 */
export const FEEDBACK_TAGS = {
  TASTY_FOOD: 'Tasty food',
  QUICK_SERVICE: 'Quick service',
  FRIENDLY_STAFF: 'Friendly staff',
  GREAT_AMBIENCE: 'Great ambience',
  GOOD_VALUE: 'Good value',
  STUDENT_FRIENDLY: 'Student friendly',
} as const
export type FeedbackTagKey = keyof typeof FEEDBACK_TAGS
export const FEEDBACK_TAG_KEYS = Object.keys(FEEDBACK_TAGS) as FeedbackTagKey[]

/**
 * Plain text: control characters and invisible/bidi-override characters removed (they can hide
 * or reverse text shown to admins), line breaks kept (max two in a row).
 */
function cleanMessage(v: string): string {
  return v
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const feedbackInputSchema = z
  .object({
    displayName: z
      .string()
      .optional()
      .transform((v) => (v ? cleanMessage(v).replace(/\n/g, ' ') : '') || null)
      .pipe(z.string().max(40, 'Name can be at most 40 characters.').nullable()),
    message: z
      .string({ error: 'Please write your feedback.' })
      .transform(cleanMessage)
      .pipe(
        z
          .string()
          .min(FEEDBACK_MIN, `Please write at least ${FEEDBACK_MIN} characters.`)
          .max(FEEDBACK_MAX, `Feedback can be at most ${FEEDBACK_MAX} characters.`),
      ),
    // Checkbox values from FormData.getAll('tags'): known keys only, duplicates dropped, in list order.
    tags: z
      .array(z.enum(FEEDBACK_TAG_KEYS, { error: 'Please choose highlights from the list.' }), {
        error: 'Please choose highlights from the list.',
      })
      .max(FEEDBACK_TAG_KEYS.length, 'Please choose highlights from the list.')
      .default([])
      .transform((v) => FEEDBACK_TAG_KEYS.filter((k) => v.includes(k))),
    website: z.string().optional(),
  })
  .strip()
export type FeedbackInput = z.infer<typeof feedbackInputSchema>

export const FEEDBACK_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const
export type FeedbackStatusKey = (typeof FEEDBACK_STATUSES)[number]

export const adminFeedbackQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).catch('pending'),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
})
