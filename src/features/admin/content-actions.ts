'use server'

import { z } from 'zod'
import {
  bannerInputSchema,
  cafeInputSchema,
  galleryInputSchema,
  offerInputSchema,
  offerItemsFromForm,
  parseHoursForm,
} from '@/lib/validation/admin-content'
import { fieldErrors } from '@/lib/validation/admin-menu'
import { requireAdmin } from '@/server/auth/admin'
import { recordAudit, type AuditAction } from '@/server/audit'
import { mediaPath, processImageUpload } from '@/server/media/image-upload'
import { getMediaStore } from '@/server/media/storage'
import { TAGS } from '@/server/public-data'
import * as content from '@/server/services/admin-content'
import {
  expirePublic,
  fail,
  guarded,
  ok,
  parseId,
  removeStoredFiles,
  type FormState,
} from './action-utils'

/**
 * Offers, banners, café information and gallery Server Actions (Phase 5C, ADR-050). Same
 * pattern as the menu actions (ADR-049): requireAdmin → Zod → service → audit → cache expiry.
 */

type Entity = 'offer' | 'banner' | 'cafe' | 'opening_hours' | 'gallery_image'

async function audit(
  adminUserId: string,
  action: AuditAction,
  entityType: Entity,
  entityId: string | null,
  summary: string,
) {
  await recordAudit({ adminUserId, action, entityType, entityId, summary })
}

/** A chosen file, or null when the file input was left empty. */
function chosenFile(form: FormData): File | null {
  const file = form.get('file')
  return file instanceof File && file.size > 0 ? file : null
}

/**
 * Validates and stores an image. Returns the new path; the caller removes it again if the
 * database write fails, so no row ever points at a missing file and no file is left without a row.
 */
async function storeImage(file: File, folder: 'gallery' | 'banners' | 'offers') {
  const bytes = await processImageUpload(file)
  const path = mediaPath(folder)
  await getMediaStore().upload(path, bytes)
  return path
}

async function withCleanup<T>(path: string | null, write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error) {
    await removeStoredFiles([path])
    throw error
  }
}

// ── Offers ───────────────────────────────────────────────────────────────────

export async function saveOfferAction(_prev: FormState, form: FormData): Promise<FormState> {
  const rawId = form.get('id')
  const admin = await requireAdmin(rawId ? `/admin/offers/${rawId}` : '/admin/offers/new')
  const id = rawId ? parseId(rawId) : null
  if (id && !id.success) return fail('Invalid offer.')
  const parsed = offerInputSchema.safeParse({
    ...Object.fromEntries(form),
    items: offerItemsFromForm(form.entries()),
  })
  if (!parsed.success) return fail('Please fix the highlighted fields.', fieldErrors(parsed.error))
  const removeImage = form.get('removeImage') === 'on'

  return guarded('offer.save', async () => {
    const file = chosenFile(form)
    const path = file ? await storeImage(file, 'offers') : null
    if (id) {
      const newImage = path ?? (removeImage ? null : undefined)
      const offer = await withCleanup(path, () =>
        content.updateOffer(id.data, parsed.data, newImage),
      )
      await removeStoredFiles([offer.oldImagePath])
      await audit(admin.id, 'UPDATE', 'offer', offer.id, `Updated offer "${offer.title}"`)
      expirePublic(TAGS.offers, TAGS.menu, `offer:${offer.slug}`)
      return ok('Offer saved.')
    }
    const offer = await withCleanup(path, () => content.createOffer(parsed.data, path))
    await audit(admin.id, 'CREATE', 'offer', offer.id, `Created offer "${offer.title}"`)
    expirePublic(TAGS.offers, TAGS.menu, `offer:${offer.slug}`)
    return ok('Offer created.', `/admin/offers/${offer.id}?created=1`)
  })
}

export async function setOfferExpiredAction(offerId: string, expired: boolean) {
  const admin = await requireAdmin(`/admin/offers/${offerId}`)
  const id = parseId(offerId)
  const value = z.boolean().safeParse(expired)
  if (!id.success || !value.success) return fail('Invalid request.')
  return guarded('offer.expire', async () => {
    const offer = await content.setOfferExpired(id.data, value.data)
    await audit(
      admin.id,
      value.data ? 'ARCHIVE' : 'RESTORE',
      'offer',
      id.data,
      `${value.data ? 'Expired' : 'Reactivated'} offer "${offer.title}"`,
    )
    expirePublic(TAGS.offers, TAGS.menu, `offer:${offer.slug}`)
    return ok(value.data ? 'Offer expired: hidden from the public site.' : 'Offer reactivated.')
  })
}

export async function deleteOfferAction(offerId: string): Promise<FormState> {
  const admin = await requireAdmin(`/admin/offers/${offerId}`)
  const id = parseId(offerId)
  if (!id.success) return fail('Invalid request.')
  return guarded('offer.delete', async () => {
    const offer = await content.deleteOffer(id.data)
    await removeStoredFiles([offer.imagePath])
    await audit(admin.id, 'DELETE', 'offer', id.data, `Deleted offer "${offer.title}"`)
    expirePublic(TAGS.offers, TAGS.menu, `offer:${offer.slug}`)
    return ok('Offer deleted.', '/admin/offers?deleted=1')
  })
}

// ── Banners ──────────────────────────────────────────────────────────────────

export async function saveBannerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const rawId = form.get('id')
  const admin = await requireAdmin(rawId ? `/admin/banners/${rawId}` : '/admin/banners/new')
  const id = rawId ? parseId(rawId) : null
  if (id && !id.success) return fail('Invalid banner.')
  const parsed = bannerInputSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return fail('Please fix the highlighted fields.', fieldErrors(parsed.error))
  const file = chosenFile(form)
  if (!id && !file) return fail('Please fix the highlighted fields.', { file: 'Choose an image.' })

  return guarded('banner.save', async () => {
    const path = file ? await storeImage(file, 'banners') : null
    if (id) {
      const banner = await withCleanup(path, () =>
        content.updateBanner(id.data, parsed.data, path ?? undefined),
      )
      await removeStoredFiles([banner.oldImagePath])
      await audit(admin.id, 'UPDATE', 'banner', banner.id, `Updated banner "${banner.title}"`)
      expirePublic(TAGS.home)
      return ok('Banner saved.')
    }
    const banner = await withCleanup(path, () => content.createBanner(parsed.data, path!))
    await audit(admin.id, 'CREATE', 'banner', banner.id, `Created banner "${banner.title}"`)
    expirePublic(TAGS.home)
    return ok('Banner created.', `/admin/banners/${banner.id}?created=1`)
  })
}

export async function deleteBannerAction(bannerId: string): Promise<FormState> {
  const admin = await requireAdmin(`/admin/banners/${bannerId}`)
  const id = parseId(bannerId)
  if (!id.success) return fail('Invalid request.')
  return guarded('banner.delete', async () => {
    const banner = await content.deleteBanner(id.data)
    await removeStoredFiles([banner.imagePath])
    await audit(admin.id, 'DELETE', 'banner', id.data, `Deleted banner "${banner.title}"`)
    expirePublic(TAGS.home)
    return ok('Banner deleted.', '/admin/banners?deleted=1')
  })
}

// ── Café information and hours ───────────────────────────────────────────────

export async function saveCafeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin('/admin/cafe')
  const parsed = cafeInputSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return fail('Please fix the highlighted fields.', fieldErrors(parsed.error))
  return guarded('cafe.save', async () => {
    await content.saveCafe(parsed.data)
    await audit(admin.id, 'UPDATE', 'cafe', 'cafe', 'Updated café information')
    expirePublic(TAGS.cafe)
    return ok('Café information saved.')
  })
}

export async function saveHoursAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin('/admin/cafe')
  const parsed = parseHoursForm(form)
  if (!parsed.ok) return fail('Please fix the highlighted days.', parsed.errors)
  return guarded('cafe.hours', async () => {
    await content.saveHours(parsed.days)
    await audit(admin.id, 'UPDATE', 'opening_hours', null, 'Updated opening hours')
    expirePublic(TAGS.cafe)
    return ok('Opening hours saved.')
  })
}

// ── Gallery ──────────────────────────────────────────────────────────────────

export async function uploadGalleryImageAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const admin = await requireAdmin('/admin/gallery')
  const parsed = galleryInputSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return fail('Please fix the highlighted fields.', fieldErrors(parsed.error))
  const file = chosenFile(form)
  if (!file) return fail('Please fix the highlighted fields.', { file: 'Choose an image.' })
  return guarded('gallery.upload', async () => {
    const path = await storeImage(file, 'gallery')
    const img = await withCleanup(path, () => content.addGalleryImage(parsed.data, path))
    await audit(admin.id, 'IMAGE_UPLOAD', 'gallery_image', img.id, 'Added a gallery photo')
    expirePublic(TAGS.home)
    return ok(
      parsed.data.isPublished ? 'Photo added and published.' : 'Photo added (not published).',
    )
  })
}

export async function updateGalleryImageAction(
  imageId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const admin = await requireAdmin('/admin/gallery')
  const id = parseId(imageId)
  if (!id.success) return fail('Invalid request.')
  const parsed = galleryInputSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return fail('Please fix the highlighted fields.', fieldErrors(parsed.error))
  return guarded('gallery.update', async () => {
    await content.updateGalleryImage(id.data, parsed.data)
    await audit(admin.id, 'UPDATE', 'gallery_image', id.data, 'Updated a gallery photo')
    expirePublic(TAGS.home)
    return ok('Photo saved.')
  })
}

export async function moveGalleryImageAction(imageId: string, delta: number) {
  const admin = await requireAdmin('/admin/gallery')
  const id = parseId(imageId)
  const step = z.union([z.literal(-1), z.literal(1)]).safeParse(delta)
  if (!id.success || !step.success) return fail('Invalid request.')
  return guarded('gallery.move', async () => {
    await content.moveGalleryImage(id.data, step.data)
    await audit(admin.id, 'UPDATE', 'gallery_image', id.data, 'Reordered the gallery')
    expirePublic(TAGS.home)
    return ok('Gallery order saved.')
  })
}

export async function deleteGalleryImageAction(imageId: string) {
  const admin = await requireAdmin('/admin/gallery')
  const id = parseId(imageId)
  if (!id.success) return fail('Invalid request.')
  return guarded('gallery.delete', async () => {
    const path = await content.deleteGalleryImage(id.data)
    await removeStoredFiles([path])
    await audit(admin.id, 'IMAGE_REMOVE', 'gallery_image', id.data, 'Removed a gallery photo')
    expirePublic(TAGS.home)
    return ok('Photo removed.')
  })
}
