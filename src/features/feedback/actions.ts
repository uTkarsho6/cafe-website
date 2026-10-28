'use server'

import { feedbackInputSchema } from '@/lib/validation/feedback'
import { clientIp } from '@/server/client-ip'
import { log } from '@/server/log'
import { RULES, hitRateLimit } from '@/server/rate-limit'
import { createFeedback } from '@/server/services/feedback'

export type FeedbackState = {
  status: 'idle' | 'success' | 'error'
  message: string | null
  errors: Record<string, string>
}

const GENERIC = 'Sorry, your feedback could not be sent. Please try again later.'

/**
 * Public feedback submission (FR-019). A Server Action: POST-only and Origin-checked by Next.js
 * (CSRF). Abuse protection: honeypot, 3 submissions per 10 minutes per IP (Postgres limiter,
 * HMAC keys), length limits, and moderation before anything becomes public.
 */
export async function submitFeedbackAction(
  _prev: FeedbackState,
  form: FormData,
): Promise<FeedbackState> {
  // getAll: the quick-highlight checkboxes send one `tags` entry each.
  const parsed = feedbackInputSchema.safeParse({
    ...Object.fromEntries(form),
    tags: form.getAll('tags'),
  })
  if (!parsed.success) {
    const errors: Record<string, string> = {}
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message
    return { status: 'error', message: 'Please fix the highlighted fields.', errors }
  }
  // Honeypot filled: pretend success, store nothing (bots get no signal to adapt to).
  if (parsed.data.website?.trim()) {
    log('info', 'feedback.honeypot', {})
    return success()
  }
  try {
    const limit = await hitRateLimit(RULES.feedbackPerIp, [await clientIp()])
    if (!limit.allowed) {
      return {
        status: 'error',
        message: 'Too many submissions. Please try again in a few minutes.',
        errors: {},
      }
    }
    await createFeedback(parsed.data)
    // Nothing public changes yet: feedback stays hidden until an admin approves it.
    return success()
  } catch {
    log('error', 'feedback.submit_failed', {})
    return { status: 'error', message: GENERIC, errors: {} }
  }
}

function success(): FeedbackState {
  return {
    status: 'success',
    message: 'Thanks! Your feedback will appear after the café reviews it.',
    errors: {},
  }
}
