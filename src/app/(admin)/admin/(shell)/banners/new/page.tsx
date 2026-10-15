import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { BannerForm } from '@/features/admin/content/banner-form'
import { BackLink } from '@/features/admin/menu/back-link'
import { requireAdmin } from '@/server/auth/admin'
import { storageConfigured } from '@/server/media/storage'

export const metadata: Metadata = { title: 'New banner' }

export default function NewBannerPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-space-xl">
      <BackLink href="/admin/banners">All banners</BackLink>
      <h1 className="text-headline-lg-mobile md:text-headline-lg">New banner</h1>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <NewBanner />
      </Suspense>
    </div>
  )
}

async function NewBanner() {
  await connection()
  await requireAdmin('/admin/banners/new')
  return (
    <section className="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm">
      <BannerForm
        uploadsEnabled={storageConfigured()}
        values={{
          title: '',
          subtitle: '',
          altText: '',
          ctaLabel: '',
          ctaHref: '',
          startsAt: '',
          endsAt: '',
          isPublished: true,
          sortOrder: 0,
          imageUrl: null,
        }}
      />
    </section>
  )
}
