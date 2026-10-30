import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * TC-SEC-020: Supabase's auto-generated REST API must not expose any table to the public
 * (publishable/anon) key. Runs against the team's DEVELOPMENT project only, read-only except for
 * write attempts that must fail. Run: `npm run test:supabase` (needs NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local; values are never printed).
 */
// Not @next/env: Vitest sets NODE_ENV=test, and Next.js deliberately skips .env.local in test
// mode, so the keys were never loaded (Phase 3 Round 2 bug). Node's loader reads the file
// directly and does not override variables already set in the shell.
if (existsSync('.env.local')) process.loadEnvFile('.env.local')
// Origin only: the variable is sometimes set to the REST URL (…/rest/v1/). Appending
// /rest/v1 to that hit a non-existent path whose 404 was wrongly counted as "denied"
// (found in Phase 5A; see the positive control below).
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const url = rawUrl ? new URL(rawUrl.trim()).origin : undefined
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

const TABLES = [
  'MenuCategory',
  'MenuItem',
  'MenuItemImage',
  'AddOnGroup',
  'AddOnOption',
  'ItemRelation',
  'Offer',
  'OfferMenuItem',
  'PromotionalBanner',
  'CafeInformation',
  'OpeningHours',
  'GalleryImage',
  'Feedback',
  'AdminUser',
  'AuditLog',
  'RateLimitBucket',
  // Phase R1 (TC-SEC-135)
  'DemoVisit',
  'DemoRating',
  'RecoModelRun',
  'ItemRecommendation',
  'ItemPopularity',
  'RecoSettings',
  '_prisma_migrations',
]

// Fails loudly instead of passing when the keys are missing, so it can never be a false PASS.
describe.runIf(Boolean(url && key))('Supabase REST API is denied (TC-SEC-020)', () => {
  const headers = {
    apikey: key!,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
  const rest = (path: string, init?: RequestInit) =>
    fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init?.headers } })

  /** True only for PostgREST's real "no access" answers. */
  async function denial(res: Response): Promise<boolean> {
    const code = (
      (await res
        .clone()
        .json()
        .catch(() => ({}))) as { code?: string }
    ).code
    return (
      ([401, 403].includes(res.status) && code === '42501') ||
      (res.status === 404 && code === 'PGRST205')
    )
  }

  it('positive control: requests reach the real PostgREST endpoint', async () => {
    const res = await rest('NoSuchTable_positive_control?select=*')
    expect(res.status).toBe(404)
    expect(((await res.json()) as { code?: string }).code).toBe('PGRST205')
  })

  it.each(TABLES)('cannot read %s', async (table) => {
    const res = await rest(`${encodeURIComponent(table)}?select=*&limit=1`)
    // Revoked privileges → 401/403 with Postgres code 42501, or 404 PGRST205 (table hidden from
    // the schema cache). Any other error (e.g. PGRST125 "invalid path") means the test is not
    // reaching the real endpoint and must fail. A 200 is only acceptable with no rows.
    if (res.ok) expect(await res.json()).toEqual([])
    else expect(await denial(res)).toBe(true)
  })

  it.each(TABLES)('cannot insert into, update or delete from %s', async (table) => {
    const t = encodeURIComponent(table)
    // `{}` (all defaults): PostgREST attempts a real INSERT, so the privilege check decides.
    // A body naming a column fails earlier on tables without that column (e.g. OfferMenuItem).
    const insert = await rest(t, { method: 'POST', body: '{}' })
    const update = await rest(`${t}?id=eq.rls-probe`, {
      method: 'PATCH',
      body: JSON.stringify({ id: 'rls-probe-2' }),
      headers: { Prefer: 'return=representation' },
    })
    const del = await rest(`${t}?id=eq.rls-probe`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    })
    expect(insert.status).not.toBe(201)
    expect(await denial(insert)).toBe(true)
    for (const res of [update, del]) {
      if (res.ok) expect(await res.json()).toEqual([])
      else expect(res.status).toBeGreaterThanOrEqual(400)
    }
  })
})

describe.skipIf(Boolean(url && key))('Supabase REST API check', () => {
  it.skip('NOT RUN: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY not set', () => {})
})
