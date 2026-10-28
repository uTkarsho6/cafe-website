import 'server-only'
import { mediaUrl } from '@/lib/media'
import type { FeedbackTagKey } from '@/lib/validation/feedback'
import { getDb } from '../db'
import { publicItemWhere } from './visibility'

export type BannerDto = {
  id: string
  title: string
  subtitle: string | null
  image: { url: string; altText: string } | null
  ctaLabel: string | null
  ctaHref: string | null
}
export type ReviewDto = {
  id: string
  displayName: string
  message: string
  tags: FeedbackTagKey[]
  createdAt: string
}
export type GalleryImageDto = { id: string; url: string; altText: string; caption: string | null }

/** Published banners inside their optional date window. */
export async function listActiveBanners(now = new Date()): Promise<BannerDto[]> {
  const rows = await getDb().promotionalBanner.findMany({
    where: {
      isPublished: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    take: 6,
    select: {
      id: true,
      title: true,
      subtitle: true,
      imagePath: true,
      altText: true,
      ctaLabel: true,
      ctaHref: true,
    },
  })
  return rows.map(({ imagePath, altText, ...b }) => {
    const url = mediaUrl(imagePath)
    return { ...b, image: url ? { url, altText } : null }
  })
}

/** Latest APPROVED feedback only (unapproved feedback is never public). */
export async function listApprovedReviews(limit = 3): Promise<ReviewDto[]> {
  const rows = await getDb().feedback.findMany({
    where: { status: 'APPROVED' },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: limit,
    select: { id: true, displayName: true, message: true, tags: true, createdAt: true },
  })
  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName?.trim() || 'Guest',
    message: r.message,
    tags: r.tags,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function listPublishedGallery(limit = 6): Promise<GalleryImageDto[]> {
  const rows = await getDb().galleryImage.findMany({
    where: { isPublished: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    take: limit,
    select: { id: true, storagePath: true, altText: true, caption: true },
  })
  return rows.flatMap((g) => {
    const url = mediaUrl(g.storagePath)
    return url ? [{ id: g.id, url, altText: g.altText, caption: g.caption }] : []
  })
}

/** Number of publicly visible menu items (a real count for the hero stat card). */
export async function countPublicItems(): Promise<number> {
  return getDb().menuItem.count({ where: publicItemWhere })
}
