import { ExternalLink } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { OfferDangerZone, OfferForm } from '@/features/admin/content/offer-forms'
import { OfferStatusBadge } from '@/features/admin/content/status-badge'
import { BackLink } from '@/features/admin/menu/back-link'
import { toIstInput } from '@/lib/validation/admin-content'
import { idSchema } from '@/lib/validation/admin-menu'
import { requireAdmin } from '@/server/auth/admin'
import { storageConfigured } from '@/server/media/storage'
import { getAdminOffer, listOfferItemOptions } from '@/server/services/admin-content'

export const metadata: Metadata = { title: 'Edit offer' }

export default function EditOfferPage({ params, searchParams }: PageProps<'/admin/offers/[id]'>) {
  return (
    <div className="flex max-w-4xl flex-col gap-space-xl">
      <BackLink href="/admin/offers">All offers</BackLink>
      <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
        <EditOffer params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function EditOffer({
  params,
  searchParams,
}: Pick<PageProps<'/admin/offers/[id]'>, 'params' | 'searchParams'>) {
  await connection()
  const { id } = await params
  await requireAdmin(`/admin/offers/${encodeURIComponent(id)}`)
  if (!idSchema.safeParse(id).success) notFound()
  const [offer, sp] = await Promise.all([getAdminOffer(id), searchParams])
  if (!offer) notFound()
  const itemOptions = await listOfferItemOptions(offer.items.map((i) => i.menuItemId))
  const isPublic = offer.status === 'active' || offer.status === 'scheduled'

  return (
    <>
      <header className="flex flex-col gap-space-sm">
        <h1 className="text-headline-lg-mobile md:text-headline-lg">{offer.title}</h1>
        <div className="flex flex-wrap items-center gap-space-sm">
          <OfferStatusBadge status={offer.status} />
          {offer.isDemo && <Badge tone="demo">Demo data</Badge>}
          {isPublic ? (
            <a
              href={`/offers/${offer.slug}`}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-12 items-center gap-1 text-label-md text-primary hover:underline"
            >
              Preview on the public site <ExternalLink aria-hidden="true" className="size-4" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            <span className="text-body-sm text-on-surface-variant">
              Not visible on the public site.
            </span>
          )}
        </div>
        {sp.created === '1' && (
          <p
            role="status"
            className="rounded-xl bg-surface-container-high px-space-md py-space-sm text-body-sm"
          >
            Offer created.
          </p>
        )}
      </header>
      <section
        aria-labelledby="offer-details"
        className="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"
      >
        <h2 id="offer-details" className="sr-only">
          Details
        </h2>
        <OfferForm
          itemOptions={itemOptions}
          uploadsEnabled={storageConfigured()}
          values={{
            id: offer.id,
            kind: offer.kind,
            title: offer.title,
            description: offer.description,
            promoPricePaise: offer.promoPricePaise,
            startsAt: toIstInput(offer.startsAt),
            endsAt: toIstInput(offer.endsAt),
            isPublished: offer.isPublished,
            isStudentOffer: offer.isStudentOffer,
            isFeatured: offer.isFeatured,
            sortOrder: offer.sortOrder,
            items: offer.items,
            imageUrl: offer.imageUrl,
          }}
        />
      </section>
      <section
        aria-labelledby="offer-state"
        className="flex flex-col gap-space-md rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"
      >
        <h2 id="offer-state" className="text-headline-sm">
          Expire or delete
        </h2>
        <OfferDangerZone
          offerId={offer.id}
          title={offer.title}
          isExpired={offer.status === 'expired'}
        />
      </section>
    </>
  )
}
