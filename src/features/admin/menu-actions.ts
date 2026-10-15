'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  addOnGroupsSchema,
  categoryInputSchema,
  fieldErrors,
  idSchema,
  imageAltSchema,
  itemInputSchema,
  relationsSchema,
} from '@/lib/validation/admin-menu'
import { requireAdmin } from '@/server/auth/admin'
import { recordAudit, type AuditAction } from '@/server/audit'
import { log } from '@/server/log'
import { UploadRejected, itemImagePath, processImageUpload } from '@/server/media/image-upload'
import { getMediaStore } from '@/server/media/storage'
import { TAGS } from '@/server/public-data'
import * as menu from '@/server/services/admin-menu'

/**
 * Menu administration Server Actions (Phase 5B, ADR-049).
 *
 * Every action: (1) `requireAdmin()` first — the session is verified with Supabase and the
 * allowlist, never trusted from the client; (2) validates every argument with Zod, including IDs
 * bound on the client; (3) writes through the typed service; (4) records an audit entry;
 * (5) expires the public cache tags so customers see the change on their next request.
 * Server Actions are POST-only and Origin-checked by Next.js (CSRF, ADR-011).
 */

export type FormState = { ok: boolean; message: string | null; errors: Record<string, string> }
const idle: FormState = { ok: false, message: null, errors: {} }
const fail = (message: string, errors: Record<string, string> = {}): FormState => ({
  ok: false,
  message,
  errors,
})
const GENERIC = 'Something went wrong. Nothing was saved; please try again.'

/** Runs a mutation and turns rule violations into messages (never internals). */
async function guarded(name: string, fn: () => Promise<FormState>): Promise<FormState> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof menu.AdminRuleError || error instanceof UploadRejected)
      return fail(error.message)
    log('error', 'admin.action_failed', { action: name })
    return fail(GENERIC)
  }
}

/**
 * Makes the change visible to customers on their next request (FR-035, ADR-049):
 * - `updateTag` expires the cached data loaders (`'use cache'` entries tagged menu / item:slug);
 * - `revalidatePath('/', 'layout')` expires the prerendered page shells. Tested on Next 16.4:
 *   with `updateTag` alone, /menu/[slug] kept serving its stored shell until the 30 s window ran
 *   out. The site is small, so re-rendering every public page once after an edit is cheap.
 * Do not add `refresh()`: it downgrades the action's revalidation to "dynamic only".
 */
function expireMenu(...slugs: string[]) {
  updateTag(TAGS.menu)
  for (const slug of slugs) updateTag(`item:${slug}`)
  revalidatePath('/', 'layout')
}

async function audit(
  adminUserId: string,
  action: AuditAction,
  entityType: 'menu_item' | 'menu_category',
  entityId: string,
  summary: string,
) {
  await recordAudit({ adminUserId, action, entityType, entityId, summary })
}

const parseId = (value: unknown) => idSchema.safeParse(value)

/**
 * Best-effort cleanup of uploaded files after their rows are gone. Demo/stock images are local
 * files and are skipped. Never fails the action: the database change has already happened, and a
 * leftover file is harmless (unguessable name, nothing points at it).
 */
async function removeStoredFiles(paths: string[]) {
  const uploaded = paths.filter((p) => p.startsWith('items/'))
  if (uploaded.length === 0) return
  try {
    await getMediaStore().remove(uploaded)
  } catch {
    log('warn', 'storage.cleanup_skipped', { count: uploaded.length })
  }
}

// ── Items ────────────────────────────────────────────────────────────────────

export async function saveItemAction(_prev: FormState, form: FormData): Promise<FormState> {
  const rawId = form.get('id')
  const admin = await requireAdmin(rawId ? `/admin/menu/${rawId}` : '/admin/menu/new')
  const id = rawId ? parseId(rawId) : null
  if (id && !id.success) return fail('Invalid item.')
  const parsed = itemInputSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return fail('Please fix the highlighted fields.', fieldErrors(parsed.error))
  const input = parsed.data

  let createdId: string | null = null
  const result = await guarded('item.save', async () => {
    if (id) {
      const item = await menu.updateItem(id.data, input)
      await audit(admin.id, 'UPDATE', 'menu_item', item.id, `Updated item "${item.name}"`)
      expireMenu(item.slug)
      return { ok: true, message: 'Item saved.', errors: {} }
    }
    const item = await menu.createItem(input)
    await audit(admin.id, 'CREATE', 'menu_item', item.id, `Created item "${item.name}"`)
    expireMenu(item.slug)
    createdId = item.id
    return { ok: true, message: 'Item created.', errors: {} }
  })
  if (createdId) redirect(`/admin/menu/${createdId}?created=1`)
  return result
}

export async function setAvailabilityAction(itemId: string, isAvailable: boolean) {
  const admin = await requireAdmin('/admin/menu')
  const id = parseId(itemId)
  const value = z.boolean().safeParse(isAvailable)
  if (!id.success || !value.success) return fail('Invalid request.')
  return guarded('item.availability', async () => {
    const item = await menu.setItemAvailability(id.data, value.data)
    await audit(
      admin.id,
      'AVAILABILITY',
      'menu_item',
      id.data,
      `Marked "${item.name}" ${value.data ? 'available' : 'out of stock'}`,
    )
    expireMenu(item.slug)
    return {
      ok: true,
      message: `"${item.name}" is now ${value.data ? 'available' : 'out of stock'}.`,
      errors: {},
    }
  })
}

export async function setItemArchivedAction(itemId: string, archived: boolean) {
  const admin = await requireAdmin(`/admin/menu/${itemId}`)
  const id = parseId(itemId)
  const value = z.boolean().safeParse(archived)
  if (!id.success || !value.success) return fail('Invalid request.')
  return guarded('item.archive', async () => {
    const item = await menu.setItemArchived(id.data, value.data)
    await audit(
      admin.id,
      value.data ? 'ARCHIVE' : 'RESTORE',
      'menu_item',
      id.data,
      `${value.data ? 'Archived' : 'Restored'} item "${item.name}"`,
    )
    expireMenu(item.slug)
    return {
      ok: true,
      message: value.data ? 'Item archived: hidden from the public site.' : 'Item restored.',
      errors: {},
    }
  })
}

export async function deleteItemAction(itemId: string): Promise<FormState> {
  const admin = await requireAdmin(`/admin/menu/${itemId}`)
  const id = parseId(itemId)
  if (!id.success) return fail('Invalid request.')
  let deleted = false
  const result = await guarded('item.delete', async () => {
    const item = await menu.deleteItem(id.data)
    await removeStoredFiles(item.paths)
    await audit(admin.id, 'DELETE', 'menu_item', id.data, `Deleted item "${item.name}"`)
    expireMenu(item.slug)
    deleted = true
    return idle
  })
  if (deleted) redirect('/admin/menu?deleted=1')
  return result
}

export async function saveAddOnsAction(
  itemId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const admin = await requireAdmin(`/admin/menu/${itemId}`)
  const id = parseId(itemId)
  if (!id.success) return fail('Invalid request.')
  let json: unknown
  try {
    json = JSON.parse(String(form.get('groups') ?? '[]'))
  } catch {
    return fail('The add-ons could not be read. Please try again.')
  }
  const parsed = addOnGroupsSchema.safeParse(json)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid add-ons.')
  return guarded('item.addons', async () => {
    const item = await menu.replaceAddOns(id.data, parsed.data)
    await audit(
      admin.id,
      'UPDATE',
      'menu_item',
      id.data,
      `Updated add-ons of "${item.name}" (${parsed.data.length} group(s))`,
    )
    expireMenu(item.slug)
    return { ok: true, message: 'Add-ons saved.', errors: {} }
  })
}

export async function saveRelationsAction(
  itemId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const admin = await requireAdmin(`/admin/menu/${itemId}`)
  const id = parseId(itemId)
  if (!id.success) return fail('Invalid request.')
  const parsed = relationsSchema.safeParse({
    related: form.getAll('related').map(String),
    together: form.getAll('together').map(String),
  })
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid selection.')
  return guarded('item.relations', async () => {
    const item = await menu.replaceRelations(id.data, parsed.data)
    await audit(admin.id, 'UPDATE', 'menu_item', id.data, `Updated linked items of "${item.name}"`)
    expireMenu(item.slug)
    return { ok: true, message: 'Linked items saved.', errors: {} }
  })
}

// ── Images ───────────────────────────────────────────────────────────────────

export async function uploadItemImageAction(
  itemId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const admin = await requireAdmin(`/admin/menu/${itemId}`)
  const id = parseId(itemId)
  if (!id.success) return fail('Invalid request.')
  const alt = imageAltSchema.safeParse(form.get('altText') ?? '')
  if (!alt.success)
    return fail('Please fix the highlighted fields.', { altText: alt.error.issues[0]!.message })
  const rawReplace = form.get('replaceImageId')
  const replace = rawReplace ? parseId(rawReplace) : null
  if (replace && !replace.success) return fail('Invalid request.')

  return guarded('item.image_upload', async () => {
    const file = form.get('file')
    const bytes = await processImageUpload(file instanceof File ? file : null)
    const path = itemImagePath(id.data)
    const store = getMediaStore()
    await store.upload(path, bytes)
    let saved: Awaited<ReturnType<typeof menu.addItemImage>>
    try {
      saved = await menu.addItemImage(id.data, path, alt.data, replace?.data)
    } catch (error) {
      await store.remove([path]) // no row points at the new file: remove it again
      throw error
    }
    if (saved.oldPath) await removeStoredFiles([saved.oldPath])
    await audit(
      admin.id,
      'IMAGE_UPLOAD',
      'menu_item',
      id.data,
      `${replace ? 'Replaced' : 'Added'} an image of "${saved.name}"`,
    )
    expireMenu(saved.slug)
    return { ok: true, message: replace ? 'Image replaced.' : 'Image uploaded.', errors: {} }
  })
}

export async function updateImageAltAction(itemId: string, imageId: string, altText: string) {
  const admin = await requireAdmin(`/admin/menu/${itemId}`)
  const ids = z.tuple([idSchema, idSchema]).safeParse([itemId, imageId])
  const alt = imageAltSchema.safeParse(altText)
  if (!ids.success) return fail('Invalid request.')
  if (!alt.success) return fail(alt.error.issues[0]!.message)
  return guarded('item.image_alt', async () => {
    await menu.updateItemImageAlt(ids.data[0], ids.data[1], alt.data)
    await audit(admin.id, 'UPDATE', 'menu_item', ids.data[0], 'Updated image alt text')
    updateTag(TAGS.menu)
    return { ok: true, message: 'Alt text saved.', errors: {} }
  })
}

export async function moveItemImageAction(itemId: string, imageId: string, delta: number) {
  const admin = await requireAdmin(`/admin/menu/${itemId}`)
  const ids = z.tuple([idSchema, idSchema]).safeParse([itemId, imageId])
  const step = z.union([z.literal(-1), z.literal(1)]).safeParse(delta)
  if (!ids.success || !step.success) return fail('Invalid request.')
  return guarded('item.image_move', async () => {
    await menu.moveItemImage(ids.data[0], ids.data[1], step.data)
    await audit(admin.id, 'UPDATE', 'menu_item', ids.data[0], 'Reordered item images')
    expireMenu()
    return { ok: true, message: 'Image order saved.', errors: {} }
  })
}

export async function removeItemImageAction(itemId: string, imageId: string) {
  const admin = await requireAdmin(`/admin/menu/${itemId}`)
  const ids = z.tuple([idSchema, idSchema]).safeParse([itemId, imageId])
  if (!ids.success) return fail('Invalid request.')
  return guarded('item.image_remove', async () => {
    const removed = await menu.removeItemImage(ids.data[0], ids.data[1])
    await removeStoredFiles([removed.path])
    await audit(
      admin.id,
      'IMAGE_REMOVE',
      'menu_item',
      ids.data[0],
      `Removed an image of "${removed.name}"`,
    )
    expireMenu(removed.slug)
    return { ok: true, message: 'Image removed.', errors: {} }
  })
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function saveCategoryAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin('/admin/categories')
  const rawId = form.get('id')
  const id = rawId ? parseId(rawId) : null
  if (id && !id.success) return fail('Invalid category.')
  const parsed = categoryInputSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return fail('Please fix the highlighted fields.', fieldErrors(parsed.error))
  return guarded('category.save', async () => {
    if (id) {
      await menu.updateCategory(id.data, parsed.data)
      await audit(
        admin.id,
        'UPDATE',
        'menu_category',
        id.data,
        `Updated category "${parsed.data.name}"`,
      )
    } else {
      const cat = await menu.createCategory(parsed.data)
      await audit(admin.id, 'CREATE', 'menu_category', cat.id, `Created category "${cat.name}"`)
    }
    expireMenu()
    return { ok: true, message: id ? 'Category saved.' : 'Category created.', errors: {} }
  })
}

export async function setCategoryArchivedAction(categoryId: string, archived: boolean) {
  const admin = await requireAdmin('/admin/categories')
  const id = parseId(categoryId)
  const value = z.boolean().safeParse(archived)
  if (!id.success || !value.success) return fail('Invalid request.')
  return guarded('category.archive', async () => {
    await menu.setCategoryArchived(id.data, value.data)
    await audit(
      admin.id,
      value.data ? 'ARCHIVE' : 'RESTORE',
      'menu_category',
      id.data,
      `${value.data ? 'Archived' : 'Restored'} a category`,
    )
    expireMenu()
    return {
      ok: true,
      message: value.data
        ? 'Category archived: it and its items are hidden from the public site.'
        : 'Category restored.',
      errors: {},
    }
  })
}

export async function deleteCategoryAction(categoryId: string) {
  const admin = await requireAdmin('/admin/categories')
  const id = parseId(categoryId)
  if (!id.success) return fail('Invalid request.')
  return guarded('category.delete', async () => {
    const name = await menu.deleteCategory(id.data)
    await audit(admin.id, 'DELETE', 'menu_category', id.data, `Deleted category "${name}"`)
    expireMenu()
    return { ok: true, message: 'Category deleted.', errors: {} }
  })
}
