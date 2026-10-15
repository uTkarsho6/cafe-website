import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { CafeForm, HoursForm } from '@/features/admin/content/cafe-forms'
import { requireAdmin } from '@/server/auth/admin'
import { getAdminCafe } from '@/server/services/admin-content'

export const metadata: Metadata = { title: 'Café info' }

export default function AdminCafePage() {
  return (
    <div className="flex max-w-4xl flex-col gap-space-xl">
      <header>
        <h1 className="text-headline-lg-mobile md:text-headline-lg">Café info</h1>
        <p className="text-body-md text-on-surface-variant">
          Address, contact, links, map and opening hours shown on the home and contact pages.
        </p>
      </header>
      <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
        <CafeEditor />
      </Suspense>
    </div>
  )
}

async function CafeEditor() {
  await connection()
  await requireAdmin('/admin/cafe')
  const { cafe, hours } = await getAdminCafe()
  return (
    <>
      <section
        aria-labelledby="cafe-info"
        className="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"
      >
        <h2 id="cafe-info" className="sr-only">
          Café information
        </h2>
        <CafeForm
          values={
            cafe ?? {
              name: 'ZORKO Sangli',
              addressLine: '',
              city: 'Sangli',
              postalCode: null,
              phone: null,
              email: null,
              whatsappNumber: null,
              instagramUrl: null,
              facebookUrl: null,
              latitude: null,
              longitude: null,
              mapsQuery: null,
              aboutText: null,
              studentZoneText: null,
              offerTerms: null,
              isPureVegConfirmed: false,
              addressVerified: false,
              contactVerified: false,
              hoursVerified: false,
              mapVerified: false,
              socialVerified: false,
            }
          }
        />
      </section>
      <section
        aria-labelledby="hours"
        className="flex flex-col gap-space-md rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"
      >
        <h2 id="hours" className="text-headline-sm">
          Opening hours
        </h2>
        <HoursForm days={hours} />
      </section>
    </>
  )
}
