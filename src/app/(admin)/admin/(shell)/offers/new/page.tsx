import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { OfferForm } from '@/features/admin/content/offer-forms'
import { BackLink } from '@/features/admin/menu/back-link'
import { toIstInput } from '@/lib/validation/admin-content'
import { requireAdmin } from '@/server/auth/admin'
import { storageConfigured } from '@/server/media/storage'
import { listOfferItemOptions } from '@/server/services/admin-content'

export const metadata: Metadata = { title: 'New offer' }

export default function NewOfferPage() {
  return (
    <div className="flex max-w-4xl flex-col gap-space-xl">
      <BackLink href="/admin/offers">All offers</BackLink>
      <h1 className="text-headline-lg-mobile md:text-headline-lg">New offer</h1>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <NewOffer />
      </Suspense>
    </div>
  )
}

async function NewOffer() {
  await connection()
  await requireAdmin('/admin/offers/new')
  const itemOptions = await listOfferItemOptions()
  const now = new Date()
  return (
    <section className="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm">
      <OfferForm
        itemOptions={itemOptions}
        uploadsEnabled={storageConfigured()}
        values={{
          kind: 'COMBO',
          title: '',
          description: '',
          promoPricePaise: null,
          startsAt: toIstInput(now),
          endsAt: toIstInput(new Date(now.getTime() + 30 * 86_400_000)),
          isPublished: false,
          isStudentOffer: false,
          isFeatured: false,
          sortOrder: 0,
          items: [],
          imageUrl: null,
        }}
      />
    </section>
  )
}
