import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { CategoryManager } from '@/features/admin/menu/category-manager'
import { requireAdmin } from '@/server/auth/admin'
import { listAdminCategories } from '@/server/services/admin-menu'

export const metadata: Metadata = { title: 'Categories' }

export default function AdminCategoriesPage() {
  return (
    <div className="flex flex-col gap-space-xl">
      <header>
        <h1 className="text-headline-lg-mobile md:text-headline-lg">Categories</h1>
        <p className="text-body-md text-on-surface-variant">
          Archiving a category hides it and all its items from the public menu.
        </p>
      </header>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Categories />
      </Suspense>
    </div>
  )
}

async function Categories() {
  await connection()
  await requireAdmin('/admin/categories')
  const categories = await listAdminCategories()
  return <CategoryManager categories={categories} />
}
