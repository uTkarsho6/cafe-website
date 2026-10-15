import { Pencil, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Badge } from '@/components/ui/badge'
import { LinkButton, buttonClasses } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/states'
import { OfferStatusBadge } from '@/features/admin/content/status-badge'
import { formatDateIST } from '@/lib/format'
import { requireAdmin } from '@/server/auth/admin'
import { listAdminOffers } from '@/server/services/admin-content'

export const metadata: Metadata = { title: 'Offers & combos' }

const KIND: Record<string, string> = { COMBO: 'Combo', DISCOUNT: 'Discount', INFO: 'Information' }

export default function AdminOffersPage({ searchParams }: PageProps<'/admin/offers'>) {
  return (
    <div className="flex flex-col gap-space-xl">
      <header className="flex flex-wrap items-end justify-between gap-space-md">
        <div>
          <h1 className="text-headline-lg-mobile md:text-headline-lg">Offers &amp; combos</h1>
          <p className="text-body-md text-on-surface-variant">
            Only published offers between their start and end dates are shown publicly.
          </p>
        </div>
        <LinkButton href="/admin/offers/new" icon={<Plus aria-hidden="true" className="size-4" />}>
          New offer
        </LinkButton>
      </header>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <OfferList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function OfferList({ searchParams }: Pick<PageProps<'/admin/offers'>, 'searchParams'>) {
  await connection()
  await requireAdmin('/admin/offers')
  const [offers, sp] = await Promise.all([listAdminOffers(), searchParams])
  return (
    <>
      {sp.deleted === '1' && (
        <p
          role="status"
          className="rounded-xl bg-surface-container-high px-space-md py-space-sm text-body-sm"
        >
          Offer deleted.
        </p>
      )}
      {offers.length === 0 ? (
        <EmptyState title="No offers yet" description="Create the first offer or combo." />
      ) : (
        <div className="relative overflow-x-auto rounded-2xl bg-surface-container-lowest shadow-sm">
          <table className="w-full min-w-[44rem] text-left text-body-sm">
            <caption className="sr-only">All offers and combos</caption>
            <thead className="text-label-md text-on-surface-variant">
              <tr className="border-b border-surface-container">
                <th scope="col" className="px-space-md py-space-sm">
                  Offer
                </th>
                <th scope="col" className="px-space-md py-space-sm">
                  Type
                </th>
                <th scope="col" className="px-space-md py-space-sm">
                  Price
                </th>
                <th scope="col" className="px-space-md py-space-sm">
                  Dates
                </th>
                <th scope="col" className="px-space-md py-space-sm">
                  Status
                </th>
                <th scope="col" className="px-space-md py-space-sm">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr
                  key={o.id}
                  data-testid="admin-offer-row"
                  className="border-b border-surface-container last:border-0"
                >
                  <th scope="row" className="px-space-md py-space-sm font-bold">
                    <Link href={`/admin/offers/${o.id}`} className="hover:underline">
                      {o.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {o.isStudentOffer && <Badge tone="student">Student</Badge>}
                      {o.isFeatured && <Badge tone="featured">Featured</Badge>}
                      {o.isDemo && <Badge tone="demo">Demo</Badge>}
                    </div>
                  </th>
                  <td className="px-space-md py-space-sm">{KIND[o.kind] ?? o.kind}</td>
                  <td className="px-space-md py-space-sm font-heading">{o.priceLabel ?? '—'}</td>
                  <td className="px-space-md py-space-sm whitespace-nowrap" data-volatile>
                    {formatDateIST(o.startsAt)} – {formatDateIST(o.endsAt)}
                  </td>
                  <td className="px-space-md py-space-sm">
                    <OfferStatusBadge status={o.status} />
                  </td>
                  <td className="px-space-md py-space-sm text-right">
                    <Link
                      href={`/admin/offers/${o.id}`}
                      aria-label={`Edit ${o.title}`}
                      className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
