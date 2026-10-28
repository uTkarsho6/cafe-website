import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ApiError, toApiError } from '@/server/http'
import { escapeLike, menuWhere } from '@/server/services/menu'
import { parseServerEnv } from '@/server/env'
import { mediaUrl } from '@/lib/media'
import { menuQuerySchema } from '@/lib/validation/public'
import { seedRefusalReason } from '../../prisma/seed-guard'

describe('error mapping (TC-UNIT-080)', () => {
  const prismaError = (code: string) =>
    Object.assign(new Error(`secret detail postgres://user:pw@host/db ${code}`), {
      code,
      name: 'PrismaClientKnownRequestError',
    })
  it.each([
    ['P2002', 'CONFLICT', 409],
    ['P2025', 'NOT_FOUND', 404],
    ['P2003', 'CONFLICT', 409],
    ['P1001', 'SERVICE_UNAVAILABLE', 503],
    ['P9999', 'INTERNAL', 500],
  ])('maps Prisma %s to %s without leaking the original message', (code, expected, status) => {
    const mapped = toApiError(prismaError(code))
    expect(mapped.code).toBe(expected)
    expect(mapped.status).toBe(status)
    expect(mapped.message).not.toMatch(/secret|postgres|P\d{4}/)
  })
  it('maps Zod errors to 400 with field messages', () => {
    const err = z.object({ a: z.string() }).safeParse({}).error!
    const mapped = toApiError(err)
    expect(mapped.status).toBe(400)
    expect(Object.keys(mapped.fields ?? {})).toEqual(['a'])
  })
  it('maps unknown errors to a generic 500 and passes ApiError through', () => {
    expect(toApiError(new TypeError('stack and internals')).message).toBe('Something went wrong.')
    const own = new ApiError('NOT_FOUND', 'x')
    expect(toApiError(own)).toBe(own)
  })
})

describe('search escaping (TC-UNIT-013)', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\')
    expect(escapeLike('paneer')).toBe('paneer')
  })
})

describe('filter builder (TC-UNIT-011)', () => {
  it('combines every filter with AND on top of the public-visibility rule', () => {
    const q = menuQuerySchema.parse({
      q: 'veg',
      category: 'burgers',
      minPrice: '100',
      maxPrice: '200',
      popular: '1',
      offers: '1',
    })
    const where = menuWhere(q, new Date('2026-10-14T00:00:00Z'))
    const and = where.AND as object[]
    expect(and).toHaveLength(7)
    expect(and).toContainEqual({ pricePaise: { gte: 10000 } })
    expect(and).toContainEqual({ pricePaise: { lte: 20000 } })
    expect(and).toContainEqual({ category: { slug: 'burgers' } })
  })
})

describe('server env (TC-UNIT-002)', () => {
  it('requires DATABASE_URL and names it without echoing values', () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL is required/)
    try {
      parseServerEnv({ DATABASE_URL: 'mysql://user:hunter2@host/db' })
    } catch (e) {
      expect(String(e)).toMatch(/DATABASE_URL must be a postgresql/)
      expect(String(e)).not.toContain('hunter2')
    }
    expect(parseServerEnv({ DATABASE_URL: ' postgresql://u@h/d ' }).databaseUrl).toBe(
      'postgresql://u@h/d',
    )
  })
})

describe('mediaUrl (TC-UNIT-071)', () => {
  const sb = 'https://abc.supabase.co'
  const uuid = '123e4567-e89b-12d3-a456-426614174000'
  it('serves demo images locally and storage images from the public bucket', () => {
    expect(mediaUrl('demo/burgers.webp', sb)).toBe('/demo/burgers.webp')
    expect(mediaUrl('photos/outlet-storefront.webp', sb)).toBe('/photos/outlet-storefront.webp')
    expect(mediaUrl(`gallery/${uuid}.webp`, sb)).toBe(
      `${sb}/storage/v1/object/public/public-media/gallery/${uuid}.webp`,
    )
  })
  it.each([
    null,
    '',
    '../secret.webp',
    'demo/../../etc/passwd',
    'photos/../.env.local',
    'photos/sub/x.webp',
    '/abs/path.webp',
    'https://evil.com/x.webp',
    `gallery/${uuid}.svg`,
  ])('returns null for unsafe or empty path %j', (p) => expect(mediaUrl(p, sb)).toBeNull())
  it('uses only the origin when the variable is the REST URL (ADR-048)', () =>
    expect(mediaUrl(`gallery/${uuid}.webp`, `${sb}/rest/v1/`)).toBe(
      `${sb}/storage/v1/object/public/public-media/gallery/${uuid}.webp`,
    ))
  it('returns null for storage paths when Supabase is not configured', () =>
    expect(mediaUrl(`gallery/${uuid}.webp`, undefined)).toBeNull())
})

describe('seed guard (TC-UNIT-070)', () => {
  const ok = { ALLOW_DEMO_SEED: 'true', DIRECT_URL: 'postgresql://x' }
  it('runs only with explicit opt-in outside production', () => {
    expect(seedRefusalReason(ok)).toBeNull()
    expect(seedRefusalReason({ ...ok, ALLOW_DEMO_SEED: undefined })).toMatch(/ALLOW_DEMO_SEED/)
    expect(seedRefusalReason({ ...ok, ALLOW_DEMO_SEED: '1' })).toMatch(/ALLOW_DEMO_SEED/)
    expect(seedRefusalReason({ ...ok, VERCEL_ENV: 'production' })).toMatch(/production/)
    expect(seedRefusalReason({ ...ok, NODE_ENV: 'production' })).toMatch(/production/)
    expect(seedRefusalReason({ ALLOW_DEMO_SEED: 'true' })).toMatch(/DIRECT_URL/)
  })
})
