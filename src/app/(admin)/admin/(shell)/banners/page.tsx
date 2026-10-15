import { Pencil, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Badge } from '@/components/ui/badge'
import { LinkButton, buttonClasses } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/states'
import { requireAdmin } from '@/server/auth/admin'
import { listAdminBanners } from '@/server/services/admin-content'

export const metadata: Metadata = { title: 'Banners' }

export default function AdminBannersPage({ searchParams }: PageProps<'/admin/banners'>) {
  return (
    <div className="flex flex-col gap-space-xl">
      <header className="flex flex-wrap items-end justify-between gap-space-md">
        <div>
          <h1 className="text-headline-lg-mobile md:text-headline-lg">Banners</h1>
          <p className="text-body-md text-on-surface-variant">
            Promotional banners on the home page (up to 6 at a time, by sort order).
          </p>
        </div>
        <LinkButton href="/admin/banners/new" icon={<Plus aria-hidden="true" className="size-4" />}>
          New banner
        </LinkButton>
      </header>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <BannerList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function BannerList({ searchParams }: Pick<PageProps<'/admin/banners'>, 'searchParams'>) {
  await connection()
  await requireAdmin('/admin/banners')
  const [banners, sp] = await Promise.all([listAdminBanners(), searchParams])
  return (
    <>
      {sp.deleted === '1' && (
        <p
          role="status"
          className="rounded-xl bg-surface-container-high px-space-md py-space-sm text-body-sm"
        >
          Banner deleted.
        </p>
      )}
      {banners.length === 0 ? (
        <EmptyState
          title="No banners yet"
          description="The home page shows no promotional banner until you add one."
        />
      ) : (
        <ul className="grid gap-space-md md:grid-cols-2">
          {banners.map((b) => (
            <li
              key={b.id}
              data-testid="admin-banner"
              className="flex flex-col gap-space-sm rounded-2xl bg-surface-container-lowest p-space-md shadow-sm"
            >
              <div className="relative aspect-[3/1] overflow-hidden rounded-xl bg-surface-container">
                {b.imageUrl && (
                  <Image
                    src={b.imageUrl}
                    alt={b.altText}
                    fill
                    sizes="(min-width: 768px) 40vw, 90vw"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="flex items-start justify-between gap-space-sm">
                <div>
                  <p className="text-label-lg">{b.title}</p>
                  <p className="text-body-sm text-on-surface-variant">
                    {b.ctaHref ? `Links to ${b.ctaHref}` : 'No button'} · order {b.sortOrder}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge tone={b.isPublished ? 'neutral' : 'scheduled'}>
                      {b.isPublished ? 'Published' : 'Hidden'}
                    </Badge>
                    {b.isDemo && <Badge tone="demo">Demo</Badge>}
                  </div>
                </div>
                <Link
                  href={`/admin/banners/${b.id}`}
                  aria-label={`Edit ${b.title}`}
                  className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
