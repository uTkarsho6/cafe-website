import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import type { MenuQuery, OffersQuery } from '@/lib/validation/public'
import type { SuggestQuery } from '@/lib/validation/reco'
import { getCafeInfo } from './services/cafe'
import { listCategories } from './services/categories'
import {
  countPublicItems,
  listActiveBanners,
  listApprovedReviews,
  listPublishedGallery,
} from './services/home'
import { getMenuItemBySlug, listMenuItems } from './services/menu'
import { getOfferBySlug, listOffers } from './services/offers'
import { getItemRecommendations, getSuggestions } from './services/recommendations'
import { listSitemapEntries } from './services/sitemap'

/**
 * Cached loaders for public pages (ADR-013, ADR-040).
 *
 * - Callers must run inside a request (after `connection()`), so nothing touches the database
 *   during `next build`.
 * - Each entry is cached for at most 30 s (`revalidate: 30`) and tagged, so admin actions in
 *   Phase 5 can refresh it immediately with `updateTag` / `revalidateTag`.
 * - Values are plain JSON DTOs (dates are ISO strings), as `'use cache'` requires.
 */

export const TAGS = {
  menu: 'menu', // categories, items, add-ons, relations
  offers: 'offers',
  cafe: 'cafe', // café info + opening hours
  home: 'home', // banners, approved reviews, gallery
  reco: 'reco', // recommendation settings and the active model run (Phase R4)
} as const

const FRESH = { stale: 30, revalidate: 30, expire: 300 }

export async function cachedCafe() {
  'use cache'
  cacheLife(FRESH)
  cacheTag(TAGS.cafe)
  return getCafeInfo()
}

export async function cachedCategories() {
  'use cache'
  cacheLife(FRESH)
  cacheTag(TAGS.menu)
  return listCategories()
}

export async function cachedMenu(query: MenuQuery) {
  'use cache'
  cacheLife(FRESH)
  cacheTag(TAGS.menu, TAGS.offers) // the "offers only" filter depends on offers too
  return listMenuItems(query)
}

export async function cachedItem(slug: string) {
  'use cache'
  cacheLife(FRESH)
  cacheTag(TAGS.menu, TAGS.offers, `item:${slug}`)
  return getMenuItemBySlug(slug)
}

export async function cachedOffers(query: OffersQuery = {}) {
  'use cache'
  cacheLife(FRESH)
  cacheTag(TAGS.offers, TAGS.menu)
  return listOffers(query)
}

export async function cachedOffer(slug: string) {
  'use cache'
  cacheLife(FRESH)
  cacheTag(TAGS.offers, TAGS.menu, `offer:${slug}`)
  return getOfferBySlug(slug)
}

export async function cachedHomeExtras() {
  'use cache'
  cacheLife(FRESH)
  cacheTag(TAGS.home, TAGS.menu)
  const [banners, reviews, gallery, itemCount] = await Promise.all([
    listActiveBanners(),
    listApprovedReviews(3),
    listPublishedGallery(6),
    countPublicItems(),
  ])
  return { banners, reviews, gallery, itemCount }
}

/** Published gallery for /gallery (capped: the café uploads tens of photos, not thousands). */
export const GALLERY_PAGE_LIMIT = 60

export async function cachedGallery() {
  'use cache'
  cacheLife(FRESH)
  cacheTag(TAGS.home)
  return listPublishedGallery(GALLERY_PAGE_LIMIT)
}

export async function cachedSitemapEntries() {
  'use cache'
  cacheLife(FRESH)
  cacheTag(TAGS.menu, TAGS.offers)
  return listSitemapEntries()
}

/**
 * Item-page recommendations (FR-063/064). Tagged `menu` too, so a sold-out change leaves the lists
 * as fast as it leaves the menu; `reco` is refreshed when a model run is activated (R5).
 */
export async function cachedItemRecommendations(slug: string) {
  'use cache'
  cacheLife(FRESH)
  cacheTag(TAGS.reco, TAGS.menu, TAGS.offers, `item:${slug}`)
  return getItemRecommendations(slug)
}

/** Help me choose (FR-065). The query has fixed values only, so the set of cache keys is finite. */
export async function cachedSuggestions(query: SuggestQuery) {
  'use cache'
  cacheLife(FRESH)
  cacheTag(TAGS.reco, TAGS.menu, TAGS.offers)
  return getSuggestions(query)
}
