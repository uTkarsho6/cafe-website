#!/usr/bin/env node
/**
 * Production preflight (Phase 8, DEPLOYMENT.md §14). Checks a production env file before it is
 * copied into Vercel or used for a production migration. Prints variable NAMES only, never values
 * (CLAUDE.md rule 23). Exit code 1 if any error.
 *
 *   node scripts/preflight.mjs .env.prod-admin            # compares against .env.local (dev)
 *   node scripts/preflight.mjs .env.prod-admin --dev .env.local
 */
import { existsSync, readFileSync } from 'node:fs'

const REQUIRED = [
  'NEXT_PUBLIC_SITE_URL',
  'DATABASE_URL',
  'DIRECT_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'RATE_LIMIT_SALT',
]
const FORBIDDEN_IN_PROD = [
  'E2E_ADMIN_EMAIL',
  'E2E_ADMIN_PASSWORD',
  'E2E_USER_EMAIL',
  'E2E_USER_PASSWORD',
  'ALLOW_DEMO_SEED',
  'ENABLE_STYLEGUIDE',
]
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]'])

/** @typedef {Record<string, string | undefined>} Env */

/**
 * Minimal .env parser: KEY=value lines, optional quotes, # comments.
 * @param {string} text
 * @returns {Env}
 */
export function parseEnvFile(text) {
  /** @type {Env} */
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

/** @param {string} value */
function url(value) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/**
 * Supabase project ref from a project URL or a pooler/direct connection string.
 * @param {Env} env
 * @returns {string | null}
 */
export function projectRef(env) {
  const api = url(env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  if (api?.hostname.endsWith('.supabase.co')) return api.hostname.split('.')[0]
  for (const key of ['DIRECT_URL', 'DATABASE_URL']) {
    const u = url(env[key] ?? '')
    if (!u) continue
    const userRef = /^postgres\.([a-z0-9]+)$/.exec(decodeURIComponent(u.username))?.[1] // pooler
    if (userRef) return userRef
    const hostRef = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(u.hostname)?.[1] // direct
    if (hostRef) return hostRef
  }
  return null
}

/**
 * Pure check, unit-tested. Returns { errors, warnings } as human-readable strings (no values).
 * @param {Env} env
 * @param {Env | null} [devEnv]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkProductionEnv(env, devEnv = null) {
  const errors = []
  const warnings = []
  for (const name of REQUIRED) if (!env[name]?.trim()) errors.push(`${name} is missing`)
  for (const name of FORBIDDEN_IN_PROD)
    if (env[name]?.trim()) errors.push(`${name} must not be set in production`)

  const site = url(env.NEXT_PUBLIC_SITE_URL ?? '')
  if (env.NEXT_PUBLIC_SITE_URL && !site) errors.push('NEXT_PUBLIC_SITE_URL is not a valid URL')
  if (site && site.protocol !== 'https:') errors.push('NEXT_PUBLIC_SITE_URL must use https')
  if (site && LOCAL_HOSTS.has(site.hostname))
    errors.push('NEXT_PUBLIC_SITE_URL must not be localhost')
  if (site && /^(\d+\.){3}\d+$/.test(site.hostname))
    errors.push('NEXT_PUBLIC_SITE_URL must be a domain, not an IP address (printed QR codes)')

  const pooled = url(env.DATABASE_URL ?? '')
  if (env.DATABASE_URL && !/^postgres(ql)?:$/.test(pooled?.protocol ?? ''))
    errors.push('DATABASE_URL must be a postgresql:// connection string')
  else if (pooled && pooled.port !== '6543')
    errors.push('DATABASE_URL should be the Transaction pooler (port 6543)')

  const direct = url(env.DIRECT_URL ?? '')
  if (env.DIRECT_URL && !/^postgres(ql)?:$/.test(direct?.protocol ?? ''))
    errors.push('DIRECT_URL must be a postgresql:// connection string')
  else if (direct && direct.port !== '5432')
    errors.push('DIRECT_URL should be the Direct connection or Session pooler (port 5432)')

  const api = url(env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  if (env.NEXT_PUBLIC_SUPABASE_URL && (!api || api.protocol !== 'https:'))
    errors.push('NEXT_PUBLIC_SUPABASE_URL must be the https project URL')

  const salt = env.RATE_LIMIT_SALT?.trim() ?? ''
  if (salt && salt.length < 32) errors.push('RATE_LIMIT_SALT must be at least 32 characters')

  const pub = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const secret = env.SUPABASE_SECRET_KEY ?? ''
  if (pub && /^sb_secret_/.test(pub))
    errors.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a SECRET key: it would reach browsers')
  if (pub && secret && pub === secret)
    errors.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are the same value')
  for (const [name, value] of Object.entries(env))
    if (
      name.startsWith('NEXT_PUBLIC_') &&
      value &&
      (value === secret || value === env.RATE_LIMIT_SALT)
    )
      errors.push(`${name} contains a server-only secret`)

  // All Supabase-derived values must point at ONE project, and not at the dev project.
  const refs = new Set(
    ['NEXT_PUBLIC_SUPABASE_URL', 'DATABASE_URL', 'DIRECT_URL']
      .map((k) => (env[k] ? projectRef({ [k]: env[k] }) : null))
      .filter(Boolean),
  )
  if (refs.size > 1)
    errors.push('Supabase URL, DATABASE_URL and DIRECT_URL point at different projects')
  const ref = projectRef(env)
  const devRef = devEnv ? projectRef(devEnv) : null
  if (ref && devRef && ref === devRef)
    errors.push('This file points at the DEVELOPMENT Supabase project; production needs its own')
  if (!devEnv)
    warnings.push('No dev env file given: could not check that production is a separate project')
  if (devEnv && devEnv.RATE_LIMIT_SALT && devEnv.RATE_LIMIT_SALT === env.RATE_LIMIT_SALT)
    errors.push('RATE_LIMIT_SALT is the same as in development; generate a new one')

  return { errors, warnings }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const file = args[0]
  const devIdx = args.indexOf('--dev')
  const devFile = devIdx >= 0 ? args[devIdx + 1] : '.env.local'
  if (!file || !existsSync(file)) {
    console.error('Usage: node scripts/preflight.mjs <production env file> [--dev .env.local]')
    process.exit(2)
  }
  if (/\.env\.production(\.local)?$/.test(file))
    console.warn(
      'WARNING: do not keep production values in .env.production(.local): Next.js and the Prisma CLI load it automatically (DEPLOYMENT.md §14).',
    )
  const env = parseEnvFile(readFileSync(file, 'utf8'))
  const devEnv = existsSync(devFile) ? parseEnvFile(readFileSync(devFile, 'utf8')) : null
  const { errors, warnings } = checkProductionEnv(env, devEnv)
  for (const w of warnings) console.log(`WARN  ${w}`)
  for (const e of errors) console.log(`FAIL  ${e}`)
  console.log(
    errors.length
      ? `\n${errors.length} problem(s). Fix them before deploying.`
      : 'PASS  production env looks complete',
  )
  process.exit(errors.length ? 1 : 0)
}
