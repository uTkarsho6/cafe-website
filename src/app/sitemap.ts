import type { MetadataRoute } from 'next'
import { connection } from 'next/server'
import { publicEnv } from '@/lib/config/env'
import { liveMore, liveNav } from '@/lib/site/nav'
import { cachedSitemapEntries } from '@/server/public-data'

/**
 * /sitemap.xml: the live public pages (same `live` flags as the navigation, ADR-042) plus every
 * visible dish and current/upcoming offer. Built at request time from the database.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection() // request time only: never query the database during `next build`
  const url = (path: string) => new URL(path, publicEnv.siteUrl).toString()
  const pages = [...liveNav(), ...liveMore(), { href: '/help-me-choose' }].map((p) => ({
    url: url(p.href),
  }))
  const details = (await cachedSitemapEntries()).map((e) => ({
    url: url(e.path),
    lastModified: e.updatedAt,
  }))
  return [...pages, ...details]
}
