import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { BackLink } from '@/features/admin/menu/back-link'
import { ItemForm } from '@/features/admin/menu/item-form'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/server/auth/admin'
import { listCategoryOptions } from '@/server/services/admin-menu'

export const metadata: Metadata = { title: 'New menu item' }

export default function NewItemPage() {
  return (
    <div className="flex max-w-4xl flex-col gap-space-xl">
      <BackLink href="/admin/menu">All menu items</BackLink>
      <h1 className="text-headline-lg-mobile md:text-headline-lg">New menu item</h1>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <NewItem />
      </Suspense>
    </div>
  )
}

async function NewItem() {
  await connection()
  await requireAdmin('/admin/menu/new')
  const categories = await listCategoryOptions()
  return (
    <section className="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm">
      <ItemForm
        categories={categories}
        values={{
          name: '',
          description: '',
          pricePaise: null,
          categoryId: '',
          dietType: 'VEG',
          isAvailable: true,
          isPublished: true,
          isBestSeller: false,
          isTrending: false,
          isFeatured: false,
          sortOrder: 0,
        }}
      />
      <p className="mt-space-md text-body-sm text-on-surface-variant">
        Images, add-ons and linked items can be added after the item is created.
      </p>
    </section>
  )
}
