import 'server-only'
import { headers } from 'next/headers'

/**
 * Client IP for rate limiting (ADR-048): the first `x-forwarded-for` hop, which Vercel's edge
 * sets. Locally there is none, so every local request shares the key "local". Only ever used
 * through an HMAC (rate-limit.ts); never stored or logged in clear.
 */
export async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local'
}
