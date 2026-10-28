import { Images } from 'lucide-react'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site/seo'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { buttonClasses } from '@/components/ui/button'
import { Container } from '@/components/ui/container'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/states'
import { GalleryGrid } from '@/features/gallery/gallery-grid'
import { cachedGallery } from '@/server/public-data'

export const metadata: Metadata = pageMetadata({
  title: 'Gallery',
  description: 'Photos of ZORKO Sangli and the ZORKO brand.',
  path: '/gallery',
})

/** Gallery (UI_SPEC §12.7, derived screen). Photos are uploaded by admins (Phase 5C). */
export default function GalleryPage() {
  return (
    <main id="main" className="flex-1">
      <div className="bg-surface-warm-cream">
        <Container className="flex flex-col gap-1 py-space-lg">
          <h1 className="text-headline-lg-mobile md:text-headline-lg">Gallery</h1>
          <p className="text-body-md text-on-surface-variant">
            Our Sangli outlet, plus photos from other ZORKO cafés and the ZORKO menu. Open a photo
            to see where it is from.
          </p>
        </Container>
      </div>
      <Container className="py-space-xl">
        <Suspense fallback={<GallerySkeleton />}>
          <GalleryContent />
        </Suspense>
      </Container>
    </main>
  )
}

function GallerySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-space-md md:grid-cols-3 lg:grid-cols-4" aria-busy="true">
      <span className="sr-only" role="status">
        Loading gallery…
      </span>
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="aspect-square rounded-2xl" />
      ))}
    </div>
  )
}

async function GalleryContent() {
  await connection() // request time only: never query the database during `next build`
  const images = await cachedGallery()
  if (images.length === 0) {
    return (
      <EmptyState
        icon={<Images aria-hidden="true" className="size-6" />}
        title="No photos yet"
        description="The café hasn't published any gallery photos yet. Check back soon."
        action={
          <Link href="/menu" className={buttonClasses({})}>
            Browse the menu
          </Link>
        }
      />
    )
  }
  return <GalleryGrid images={images} />
}
