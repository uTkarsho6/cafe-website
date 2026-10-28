// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { checkProductionEnv, parseEnvFile, projectRef } from '../../scripts/preflight.mjs'

/** Production preflight (TC-UNIT-125, Phase 8). Fake values only. */
const PROD = {
  NEXT_PUBLIC_SITE_URL: 'https://zorko-sangli.example',
  DATABASE_URL:
    'postgresql://postgres.prodref123:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
  DIRECT_URL:
    'postgresql://postgres.prodref123:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
  NEXT_PUBLIC_SUPABASE_URL: 'https://prodref123.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
  RATE_LIMIT_SALT: 'a'.repeat(64),
}
const DEV = {
  ...PROD,
  NEXT_PUBLIC_SUPABASE_URL: 'https://devref456.supabase.co',
  RATE_LIMIT_SALT: 'b'.repeat(64),
}

describe('production preflight (TC-UNIT-125)', () => {
  it('a complete, separate production env passes', () => {
    expect(checkProductionEnv(PROD, DEV)).toEqual({ errors: [], warnings: [] })
  })
  it('reports missing variables by name', () => {
    const { errors } = checkProductionEnv(
      { ...PROD, SUPABASE_SECRET_KEY: '', RATE_LIMIT_SALT: undefined },
      DEV,
    )
    expect(errors).toContain('SUPABASE_SECRET_KEY is missing')
    expect(errors).toContain('RATE_LIMIT_SALT is missing')
  })
  it('refuses http, localhost and IP site URLs', () => {
    for (const bad of ['http://zorko.example', 'https://localhost:3000', 'https://192.168.1.20'])
      expect(
        checkProductionEnv({ ...PROD, NEXT_PUBLIC_SITE_URL: bad }, DEV).errors.length,
        bad,
      ).toBeGreaterThan(0)
  })
  it('checks pooler ports, salt length and test-only variables', () => {
    const { errors } = checkProductionEnv(
      {
        ...PROD,
        DATABASE_URL: PROD.DIRECT_URL,
        DIRECT_URL: PROD.DATABASE_URL,
        RATE_LIMIT_SALT: 'short',
        E2E_ADMIN_PASSWORD: 'x',
        ALLOW_DEMO_SEED: 'true',
      },
      DEV,
    )
    expect(errors).toEqual(
      expect.arrayContaining([
        'DATABASE_URL should be the Transaction pooler (port 6543)',
        'DIRECT_URL should be the Direct connection or Session pooler (port 5432)',
        'RATE_LIMIT_SALT must be at least 32 characters',
        'E2E_ADMIN_PASSWORD must not be set in production',
        'ALLOW_DEMO_SEED must not be set in production',
      ]),
    )
  })
  it('catches a secret key in a NEXT_PUBLIC_ variable', () => {
    const { errors } = checkProductionEnv(
      { ...PROD, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PROD.SUPABASE_SECRET_KEY },
      DEV,
    )
    expect(errors.some((e) => e.includes('SECRET key'))).toBe(true)
  })
  it('refuses the development project, mixed projects and a reused salt', () => {
    expect(checkProductionEnv(PROD, { ...PROD, RATE_LIMIT_SALT: 'c'.repeat(64) }).errors).toContain(
      'This file points at the DEVELOPMENT Supabase project; production needs its own',
    )
    expect(
      checkProductionEnv({ ...PROD, NEXT_PUBLIC_SUPABASE_URL: 'https://otherref.supabase.co' }, DEV)
        .errors,
    ).toContain('Supabase URL, DATABASE_URL and DIRECT_URL point at different projects')
    expect(
      checkProductionEnv(PROD, { ...DEV, RATE_LIMIT_SALT: PROD.RATE_LIMIT_SALT }).errors,
    ).toContain('RATE_LIMIT_SALT is the same as in development; generate a new one')
  })
  it('never puts a value into a message', () => {
    const { errors } = checkProductionEnv(
      { ...PROD, NEXT_PUBLIC_SITE_URL: 'http://leak-me.example' },
      PROD,
    )
    expect(errors.join(' ')).not.toMatch(/leak-me|sb_secret|prodref123|aaaa/)
  })
  it('parses env files and finds project refs from URLs and pooler user names', () => {
    expect(parseEnvFile('# c\nA_1="x"\nB=y\n')).toEqual({ A_1: 'x', B: 'y' })
    expect(
      projectRef({ DIRECT_URL: 'postgresql://postgres:pw@db.abc123.supabase.co:5432/postgres' }),
    ).toBe('abc123')
    expect(projectRef({ DATABASE_URL: PROD.DATABASE_URL })).toBe('prodref123')
  })
})
