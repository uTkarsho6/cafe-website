import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { BannerForm, DeleteBannerButton } from '@/features/admin/content/banner-form'
import { BackLink } from '@/features/admin/menu/back-link'
import { toIstInput } from '@/lib/validation/admin-content'
import { idSchema } from '@/lib/validation/admin-menu'
import { requireAdmin } from '@/server/auth/admin'
import { storageConfigured } from '@/server/media/storage'
import { getAdminBanner } from '@/server/services/admin-content'

export const metadata: Metadata = { title: 'Edit banner' }

export default function EditBannerPage({ params, searchParams }: PageProps<'/admin/banners/[id]'>) {
  return (
    <div className="flex max-w-3xl flex-col gap-space-xl">
      <BackLink href="/admin/banners">All banners</BackLink>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <EditBanner params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function EditBanner({
  params,
  searchParams,
}: Pick<PageProps<'/admin/banners/[id]'>, 'params' | 'searchParams'>) {
  await connection()
  const { id } = await params
  await requireAdmin(`/admin/banners/${encodeURIComponent(id)}`)
  if (!idSchema.safeParse(id).success) notFound()
  const [b, sp] = await Promise.all([getAdminBanner(id), searchParams])
  if (!b) notFound()
  return (
    <>
      <h1 className="text-headline-lg-mobile md:text-headline-lg">{b.title}</h1>
      {sp.created === '1' && (
        <p
          role="status"
          className="rounded-xl bg-surface-container-high px-space-md py-space-sm text-body-sm"
        >
          Banner created.
        </p>
      )}
      <section className="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm">
        <BannerForm
          uploadsEnabled={storageConfigured()}
          values={{
            id: b.id,
            title: b.title,
            subtitle: b.subtitle ?? '',
            altText: b.altText,
            ctaLabel: b.ctaLabel ?? '',
            ctaHref: b.ctaHref ?? '',
            startsAt: toIstInput(b.startsAt),
            endsAt: toIstInput(b.endsAt),
            isPublished: b.isPublished,
            sortOrder: b.sortOrder,
            imageUrl: b.imageUrl,
          }}
        />
      </section>
      <div>
        <DeleteBannerButton bannerId={b.id} title={b.title} />
      </div>
    </>
  )
}
