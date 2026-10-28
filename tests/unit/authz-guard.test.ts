// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Static authorization guard (Phase 7, TC-SEC-031). Fails the build if a new admin page or
 * Server Action forgets `requireAdmin()`. Runtime behaviour is covered by the action unit tests
 * and the E2E replay tests; this catches the mistake before it ships.
 */
const root = path.resolve(__dirname, '../..')
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}
const rel = (p: string) => path.relative(root, p)

describe('every admin entry point checks the admin', () => {
  it('every admin page under (shell) calls requireAdmin()', () => {
    const pages = walk(path.join(root, 'src/app/(admin)/admin/(shell)')).filter((p) =>
      p.endsWith('page.tsx'),
    )
    expect(pages.length).toBeGreaterThanOrEqual(15)
    for (const p of pages) expect(readFileSync(p, 'utf8'), rel(p)).toContain('await requireAdmin(')
  })

  it('every exported Server Action calls requireAdmin() first (sign-in/out excepted)', () => {
    const PUBLIC = new Set(['loginAction', 'logoutAction', 'submitFeedbackAction'])
    const modules = walk(path.join(root, 'src')).filter(
      (p) => /\.tsx?$/.test(p) && readFileSync(p, 'utf8').startsWith("'use server'"),
    )
    expect(modules.length).toBeGreaterThanOrEqual(5)
    let checked = 0
    for (const file of modules) {
      const src = readFileSync(file, 'utf8')
      const fns = [...src.matchAll(/export async function (\w+)\([\s\S]*?\{\n([\s\S]*?)\n\}/g)]
      for (const [, name, body] of fns) {
        if (PUBLIC.has(name!)) continue
        // The admin check must be the first thing awaited: nothing is read from the database,
        // Storage or the request body (beyond the synchronous form ID) before it.
        const firstAwait = body!.indexOf('await ')
        expect(firstAwait, `${rel(file)}#${name}`).toBeGreaterThanOrEqual(0)
        expect(body!.slice(firstAwait), `${rel(file)}#${name}`).toMatch(/^await requireAdmin\(/)
        checked++
      }
    }
    expect(checked).toBeGreaterThanOrEqual(26)
  })
})
