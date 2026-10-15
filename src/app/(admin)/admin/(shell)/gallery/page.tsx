import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { GalleryManager } from '@/features/admin/content/gallery-manager'
import { requireAdmin } from '@/server/auth/admin'
import { storageConfigured } from '@/server/media/storage'
import { listAdminGallery } from '@/server/services/admin-content'

export const metadata: Metadata = { title: 'Gallery' }

export default function AdminGalleryPage() {
  return (
    <div className="flex flex-col gap-space-xl">
      <header>
        <h1 className="text-headline-lg-mobile md:text-headline-lg">Gallery</h1>
        <p className="text-body-md text-on-surface-variant">
          Published photos appear on the gallery page in this order (the first six on the home
          page).
        </p>
      </header>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Gallery />
      </Suspense>
    </div>
  )
}

async function Gallery() {
  await connection()
  await requireAdmin('/admin/gallery')
  const images = await listAdminGallery()
  return <GalleryManager images={images} uploadsEnabled={storageConfigured()} />
}
