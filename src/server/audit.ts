import 'server-only'
import { getDb } from './db'
import { log } from './log'

/**
 * Audit records for important admin actions (CLAUDE.md §4.9): who, what, when, a short
 * non-sensitive summary. Never pass passwords, tokens, cookies, emails or IPs in `summary`.
 */
export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_REFUSED'
  | 'LOGOUT'
  | 'ADMIN_ALLOWLISTED'
  | 'CREATE'
  | 'UPDATE'
  | 'AVAILABILITY'
  | 'ARCHIVE'
  | 'RESTORE'
  | 'DELETE'
  | 'IMAGE_UPLOAD'
  | 'IMAGE_REMOVE'

export async function recordAudit(entry: {
  adminUserId: string | null
  action: AuditAction
  entityType: string
  entityId?: string | null
  summary: string
}): Promise<void> {
  try {
    await getDb().auditLog.create({
      data: {
        adminUserId: entry.adminUserId,
        action: entry.action,
        entityType: entry.entityType.slice(0, 40),
        entityId: entry.entityId?.slice(0, 40) ?? null,
        summary: entry.summary.replace(/\s+/g, ' ').trim().slice(0, 300),
      },
    })
  } catch {
    // Auditing must not break the action itself; the failure is logged without details.
    log('error', 'audit.write_failed', { action: entry.action, entityType: entry.entityType })
  }
}
