import type { NextConfig } from 'next'
import path from 'node:path'
import { buildSecurityHeaders } from './src/lib/security/headers'

const isDev = process.env.NODE_ENV === 'development'

// Same default as src/lib/config/env.ts (validated there at startup).
const isHttps = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').startsWith('https://')

const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : undefined

const nextConfig: NextConfig = {
  // Next 16 defaults from create-next-app (see DECISIONS ADR-013 for how caching is used).
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    // Image uploads (5 MB max, checked again in the action) plus multipart overhead (ADR-049).
    serverActions: { bodySizeLimit: '6mb' },
  },
  images: {
    // Uploaded menu/gallery images are served from the Supabase Storage public bucket.
    remotePatterns: supabaseOrigin
      ? [new URL(`${supabaseOrigin}/storage/v1/object/public/**`)]
      : [],
  },
  turbopack: {
    // Pin the project root: an unrelated package-lock.json exists in a parent folder.
    root: path.resolve(__dirname),
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async headers() {
    return [{ source: '/(.*)', headers: buildSecurityHeaders({ isDev, isHttps, supabaseOrigin }) }]
  },
}

export default nextConfig
