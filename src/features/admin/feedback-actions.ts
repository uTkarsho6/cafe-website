'use server'

import { z } from 'zod'
import { requireAdmin } from '@/server/auth/admin'
import { recordAudit } from '@/server/audit'
import { TAGS } from '@/server/public-data'
import { deleteFeedback, moderateFeedback } from '@/server/services/feedback'
import { expirePublic, fail, guarded, ok, parseId } from './action-utils'

/**
 * Feedback moderation (FR-044). Approving makes feedback public on the home and contact pages;
 * rejecting or deleting removes it from them at once. Every action is authorised and audited.
 * The audit summary never contains the feedback text or the name.
 */
export async function moderateFeedbackAction(feedbackId: string, decision: string) {
  const admin = await requireAdmin('/admin/feedback')
  const id = parseId(feedbackId)
  const status = z.enum(['APPROVED', 'REJECTED']).safeParse(decision)
  if (!id.success || !status.success) return fail('Invalid request.')
  return guarded('feedback.moderate', async () => {
    await moderateFeedback(id.data, status.data, admin.id)
    await recordAudit({
      adminUserId: admin.id,
      action: status.data === 'APPROVED' ? 'APPROVE' : 'REJECT',
      entityType: 'feedback',
      entityId: id.data,
      summary: status.data === 'APPROVED' ? 'Approved feedback' : 'Rejected feedback',
    })
    expirePublic(TAGS.home)
    return ok(
      status.data === 'APPROVED'
        ? 'Approved: now shown publicly.'
        : 'Rejected: not shown publicly.',
    )
  })
}

export async function deleteFeedbackAction(feedbackId: string) {
  const admin = await requireAdmin('/admin/feedback')
  const id = parseId(feedbackId)
  if (!id.success) return fail('Invalid request.')
  return guarded('feedback.delete', async () => {
    await deleteFeedback(id.data)
    await recordAudit({
      adminUserId: admin.id,
      action: 'DELETE',
      entityType: 'feedback',
      entityId: id.data,
      summary: 'Deleted feedback',
    })
    expirePublic(TAGS.home)
    return ok('Feedback deleted.')
  })
}
