import 'server-only'
import type { FeedbackStatusKey } from '@/lib/validation/feedback'
import { AdminRuleError } from '../admin-errors'
import { getDb } from '../db'

/**
 * Feedback (FR-019/020/044). New feedback is always PENDING; only APPROVED feedback is ever
 * public (home/contact, via listApprovedReviews). Text is stored as typed and rendered as escaped
 * text by React, never as HTML.
 */
export async function createFeedback(input: { displayName: string | null; message: string }) {
  return getDb().feedback.create({
    data: { displayName: input.displayName, message: input.message, status: 'PENDING' },
    select: { id: true },
  })
}

export const FEEDBACK_PAGE_SIZE = 20

export async function listAdminFeedback(status: FeedbackStatusKey, page: number) {
  const db = getDb()
  const where = { status }
  const [total, rows, counts] = await Promise.all([
    db.feedback.count({ where }),
    db.feedback.findMany({
      where,
      orderBy: [{ createdAt: status === 'PENDING' ? 'asc' : 'desc' }, { id: 'asc' }],
      skip: (page - 1) * FEEDBACK_PAGE_SIZE,
      take: FEEDBACK_PAGE_SIZE,
      select: {
        id: true,
        displayName: true,
        message: true,
        status: true,
        isDemo: true,
        createdAt: true,
        moderatedAt: true,
        moderatedBy: { select: { displayName: true, email: true } },
      },
    }),
    db.feedback.groupBy({ by: ['status'], _count: { _all: true } }),
  ])
  return {
    total,
    totalPages: Math.max(1, Math.ceil(total / FEEDBACK_PAGE_SIZE)),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<
      Record<FeedbackStatusKey, number>
    >,
    items: rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      message: r.message,
      status: r.status,
      isDemo: r.isDemo,
      createdAt: r.createdAt.toISOString(),
      moderatedAt: r.moderatedAt?.toISOString() ?? null,
      moderatedBy: r.moderatedBy ? (r.moderatedBy.displayName ?? r.moderatedBy.email) : null,
    })),
  }
}

export async function moderateFeedback(
  id: string,
  status: 'APPROVED' | 'REJECTED',
  adminUserId: string,
) {
  const res = await getDb().feedback.updateMany({
    where: { id },
    data: { status, moderatedAt: new Date(), moderatedById: adminUserId },
  })
  if (res.count === 0) throw new AdminRuleError('This feedback no longer exists.')
}

export async function deleteFeedback(id: string) {
  const res = await getDb().feedback.deleteMany({ where: { id } })
  if (res.count === 0) throw new AdminRuleError('This feedback no longer exists.')
}

export const REJECTED_RETENTION_DAYS = 90

/**
 * Retention (SECURITY.md §10, NFR-005): rejected feedback is deleted 90 days after it was
 * rejected. Runs when an admin opens the moderation page, so no scheduler is needed; it is a
 * single indexed delete.
 */
export async function purgeOldRejectedFeedback(now = new Date()) {
  const cutoff = new Date(now.getTime() - REJECTED_RETENTION_DAYS * 86_400_000)
  const res = await getDb().feedback.deleteMany({
    where: { status: 'REJECTED', moderatedAt: { lt: cutoff } },
  })
  return res.count
}
