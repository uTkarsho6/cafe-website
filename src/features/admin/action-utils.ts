import 'server-only'
import { revalidatePath, updateTag } from 'next/cache'
import { idSchema } from '@/lib/validation/admin-menu'
import { AdminRuleError } from '@/server/admin-errors'
import { log } from '@/server/log'
import { UploadRejected } from '@/server/media/image-upload'
import { getMediaStore } from '@/server/media/storage'

/**
 * Shared helpers for admin Server Actions (Phases 5B/5C, ADR-049). Not a 'use server' module:
 * nothing here can be called from the browser.
 */

export type FormState = {
  ok: boolean
  message: string | null
  errors: Record<string, string>
  /**
   * Where the browser should go next. Actions return this instead of calling `redirect()`:
   * on Next 16.4 a redirecting action hands its cache invalidations only to the redirected
   * page's render, so other visitors kept seeing the stale public pages (ADR-050).
   */
  redirectTo?: string
}

export const idle: FormState = { ok: false, message: null, errors: {} }
export const ok = (message: string, redirectTo?: string): FormState => ({
  ok: true,
  message,
  errors: {},
  ...(redirectTo ? { redirectTo } : {}),
})
export const fail = (message: string, errors: Record<string, string> = {}): FormState => ({
  ok: false,
  message,
  errors,
})
const GENERIC = 'Something went wrong. Nothing was saved; please try again.'

export const parseId = (value: unknown) => idSchema.safeParse(value)

/** Runs a mutation and turns rule violations into messages (never internals). */
export async function guarded(name: string, fn: () => Promise<FormState>): Promise<FormState> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof AdminRuleError || error instanceof UploadRejected)
      return fail(error.message)
    log('error', 'admin.action_failed', { action: name })
    return fail(GENERIC)
  }
}

/**
 * Makes a change visible to customers on their next request (FR-047, ADR-049):
 * - `updateTag` expires the cached data loaders (`'use cache'` entries with these tags);
 * - `revalidatePath('/', 'layout')` expires the prerendered page shells. Tested on Next 16.4:
 *   with `updateTag` alone, /menu/[slug] kept serving its stored shell until the 30 s window ran
 *   out. The site is small, so re-rendering every public page once after an edit is cheap.
 * Do not add `refresh()`: it downgrades the action's revalidation to "dynamic only".
 */
export function expirePublic(...tags: string[]) {
  for (const tag of new Set(tags)) updateTag(tag)
  revalidatePath('/', 'layout')
}

const UPLOADED = /^(items\/[a-z0-9]+|gallery|banners|offers)\//

/**
 * Best-effort cleanup of uploaded files after their rows are gone. Bundled demo/stock images are
 * local files and are skipped. Never fails the action: the database change has already happened,
 * and a leftover file is harmless (unguessable name, nothing points at it).
 */
export async function removeStoredFiles(paths: Array<string | null | undefined>) {
  const uploaded = paths.filter((p): p is string => Boolean(p && UPLOADED.test(p)))
  if (uploaded.length === 0) return
  try {
    await getMediaStore().remove(uploaded)
  } catch {
    log('warn', 'storage.cleanup_skipped', { count: uploaded.length })
  }
}
