import 'server-only'
import { createHmac } from 'node:crypto'
import { getRateLimitSalt } from './auth/env'
import { getDb } from './db'

/**
 * Fixed-window rate limiter backed by Postgres (ADR-014). Works across serverless instances,
 * unlike in-memory counters. The stored key is an HMAC of the client key, so raw IPs and
 * emails never reach the database.
 */
export type RateLimitRule = { scope: string; limit: number; windowMs: number }

export const RULES = {
  loginPerAccount: { scope: 'login', limit: 5, windowMs: 15 * 60_000 },
  loginPerIp: { scope: 'login-ip', limit: 20, windowMs: 15 * 60_000 },
  feedbackPerIp: { scope: 'feedback', limit: 3, windowMs: 10 * 60_000 },
  /** Recommendation APIs (FR-066): 60 requests per minute per IP. */
  recoPerIp: { scope: 'reco', limit: 60, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>

export type RateLimitResult = { allowed: boolean; retryAfterSec: number }

export function hashKey(parts: string[], salt: string): string {
  return createHmac('sha256', salt).update(parts.join('\u0000')).digest('hex')
}

/** Counts one attempt and reports whether it is within the limit. */
export async function hitRateLimit(
  rule: RateLimitRule,
  keyParts: string[],
  now = new Date(),
): Promise<RateLimitResult> {
  const windowStart = new Date(Math.floor(now.getTime() / rule.windowMs) * rule.windowMs)
  const key = hashKey([rule.scope, ...keyParts], getRateLimitSalt())
  const db = getDb()
  // Atomic: INSERT … ON CONFLICT DO UPDATE SET count = count + 1 (unique on key+scope+window).
  const bucket = await db.rateLimitBucket.upsert({
    where: { key_scope_windowStart: { key, scope: rule.scope, windowStart } },
    create: { key, scope: rule.scope, windowStart, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  })
  // Opportunistic cleanup of old windows (about 1 in 50 calls); never blocks the request.
  if (Math.random() < 0.02) {
    void db.rateLimitBucket
      .deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 86_400_000) } } })
      .catch(() => {})
  }
  const retryAfterSec = Math.ceil((windowStart.getTime() + rule.windowMs - now.getTime()) / 1000)
  return { allowed: bucket.count <= rule.limit, retryAfterSec }
}
