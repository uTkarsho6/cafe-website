#!/usr/bin/env node
/**
 * Public-artifact secret scan (Phase 8, DEPLOYMENT.md §14). After `npm run build`, checks that no
 * server-only secret VALUE from the given env file appears in what browsers can download
 * (`.next/static`) or in prerendered pages (`.next/server/app`). Prints names and counts only.
 *
 *   npm run build && node scripts/scan-build.mjs .env.local
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnvFile } from './preflight.mjs'

const SECRET_NAMES = [
  'SUPABASE_SECRET_KEY',
  'DATABASE_URL',
  'DIRECT_URL',
  'RATE_LIMIT_SALT',
  'E2E_ADMIN_PASSWORD',
  'E2E_USER_PASSWORD',
]
const ROOTS = ['.next/static', '.next/server/app']
const TEXT = /\.(js|mjs|html|rsc|json|css|txt|map|body|meta)$/

const file = process.argv[2]
if (!file || !existsSync(file)) {
  console.error('Usage: node scripts/scan-build.mjs <env file>   (run `npm run build` first)')
  process.exit(2)
}
if (!existsSync('.next/static')) {
  console.error('No .next/static: run `npm run build` first.')
  process.exit(2)
}
const env = parseEnvFile(readFileSync(file, 'utf8'))
/** @type {[string, string][]} */
const needles = SECRET_NAMES.filter((n) => (env[n] ?? '').length >= 8).map((n) => [n, env[n] ?? ''])
try {
  const pw = decodeURIComponent(new URL(env.DATABASE_URL ?? '').password)
  if (pw.length >= 8) needles.push(['DATABASE_URL password', pw])
} catch {
  // no parsable DATABASE_URL: nothing extra to check
}

/** @type {string[]} */
const files = []
/** @param {string} dir */
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (TEXT.test(p)) files.push(p)
  }
}
ROOTS.filter(existsSync).forEach(walk)

/** @type {Record<string, number>} */
const hits = Object.fromEntries(needles.map(([n]) => [n, 0]))
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  for (const [name, value] of needles) if (text.includes(value)) hits[name] = (hits[name] ?? 0) + 1
}
const leaked = Object.entries(hits).filter(([, n]) => n > 0)
console.log(
  `Scanned ${files.length} files for: ${needles.map(([n]) => n).join(', ') || '(no secrets set)'}`,
)
for (const [name, n] of leaked) console.log(`FAIL  ${name} value found in ${n} file(s)`)
console.log(
  leaked.length
    ? 'Rotate the leaked secret(s) and fix the code before deploying.'
    : 'PASS  no secret values in build output',
)
process.exit(leaked.length ? 1 : 0)
