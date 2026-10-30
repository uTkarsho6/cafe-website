import 'server-only'
import { clientIp } from '../client-ip'
import { ApiError, fail } from '../http'
import { RULES, hitRateLimit } from '../rate-limit'

/** Rate limit for the public recommendation APIs (60/min per IP). Returns a 429 response or null. */
export async function recoRateLimited(): Promise<Response | null> {
  const limit = await hitRateLimit(RULES.recoPerIp, [await clientIp()])
  if (limit.allowed) return null
  return fail(new ApiError('RATE_LIMITED', 'Too many requests. Please try again in a minute.'), {
    'Retry-After': String(limit.retryAfterSec),
  })
}
