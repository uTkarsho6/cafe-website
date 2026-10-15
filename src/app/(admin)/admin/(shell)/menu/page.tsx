import { Pencil, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Badge } from '@/components/ui/badge'
import { LinkButton, buttonClasses } from '@/components/ui/button'
import { Select, TextField } from '@/components/ui/field'
import { Pagination } from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/states'
import { AvailabilityToggle } from '@/features/admin/menu/item-controls'
import { adminItemQuerySchema } from '@/lib/validation/admin-menu'
import { requireAdmin } from '@/server/auth/admin'
import { listAdminItems, listCategoryOptions } from '@/server/services/admin-menu'

export const metadata: Metadata = { title: 'Menu items' }

const STATUS_OPTIONS = [
  ['all', 'All (not archived)'],
  ['available', 'Available'],
  ['unavailable', 'Out of stock'],
  ['hidden', 'Unpublished'],
  ['archived', 'Archived'],
] as const

export default function AdminMenuPage({ searchParams }: PageProps<'/admin/menu'>) {
  return (
    <div className="flex flex-col gap-space-xl">
      <header className="flex flex-wrap items-end justify-between gap-space-md">
        <div>
          <h1 className="text-headline-lg-mobile md:text-headline-lg">Menu items</h1>
          <p className="text-body-md text-on-surface-variant">
            Changes appear on the public site immediately (at most 30 seconds).
          </p>
        </div>
        <LinkButton href="/admin/menu/new" icon={<Plus aria-hidden="true" className="size-4" />}>
          New item
        </LinkButton>
      </header>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ItemList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function ItemList({
  searchParams,
}: {
  searchParams: PageProps<'/admin/menu'>['searchParams']
}) {
  await connection()
  await requireAdmin('/admin/menu')
  const raw = await searchParams
  const query = adminItemQuerySchema.parse({
    q: typeof raw.q === 'string' ? raw.q : undefined,
    category: typeof raw.category === 'string' && raw.category ? raw.category : undefined,
    status: raw.status,
    page: raw.page,
  })
  const [{ items, total, totalPages }, categories] = await Promise.all([
    listAdminItems(query),
    listCategoryOptions(),
  ])
  const notice = raw.deleted === '1' ? 'Item deleted.' : null

  return (
    <>
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-surface-container-high px-space-md py-space-sm text-body-sm"
        >
          {notice}
        </p>
      )}
      <form
        role="search"
        aria-label="Filter menu items"
        className="grid gap-space-md rounded-2xl bg-surface-container-lowest p-space-md shadow-sm md:grid-cols-2 md:items-end xl:grid-cols-[1fr_14rem_12rem_auto]"
      >
        <TextField
          label="Search by name"
          name="q"
          type="search"
          defaultValue={query.q ?? ''}
          maxLength={80}
        />
        <Select label="Category" name="category" defaultValue={query.category ?? ''}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.isArchived ? ' (archived)' : ''}
            </option>
          ))}
        </Select>
        <Select label="Status" name="status" defaultValue={query.status}>
          {STATUS_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <div className="flex gap-space-sm">
          <button type="submit" className={buttonClasses({ variant: 'secondary' })}>
            Apply
          </button>
          <Link href="/admin/menu" className={buttonClasses({ variant: 'ghost' })}>
            Reset
          </Link>
        </div>
      </form>

      <p className="text-body-sm text-on-surface-variant" aria-live="polite">
        {total} item{total === 1 ? '' : 's'}
      </p>

      {items.length === 0 ? (
        <EmptyState title="No items match" description="Change the filters or add a new item." />
      ) : (
        <div className="relative overflow-x-auto rounded-2xl bg-surface-container-lowest shadow-sm">
          <table className="w-full min-w-[46rem] text-left text-body-sm">
            <caption className="sr-only">
              Menu items, page {query.page} of {totalPages}
            </caption>
            <thead className="text-label-md text-on-surface-variant">
              <tr className="border-b border-surface-container">
                <th scope="col" className="px-space-md py-space-sm">
                  Item
                </th>
                <th scope="col" className="px-space-md py-space-sm">
                  Category
                </th>
                <th scope="col" className="px-space-md py-space-sm">
                  Price
                </th>
                <th scope="col" className="px-space-md py-space-sm">
                  Labels
                </th>
                <th scope="col" className="px-space-md py-space-sm">
                  Available
                </th>
                <th scope="col" className="px-space-md py-space-sm">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr
                  key={it.id}
                  data-testid="admin-item-row"
                  className="border-b border-surface-container last:border-0"
                >
                  <th scope="row" className="px-space-md py-space-sm font-bold">
                    <Link href={`/admin/menu/${it.id}`} className="hover:underline">
                      {it.name}
                    </Link>
                  </th>
                  <td className="px-space-md py-space-sm">{it.categoryName}</td>
                  <td className="px-space-md py-space-sm font-heading">{it.priceLabel}</td>
                  <td className="px-space-md py-space-sm">
                    <div className="flex flex-wrap gap-1">
                      {it.isArchived && <Badge tone="scheduled">Archived</Badge>}
                      {!it.isPublished && <Badge tone="scheduled">Unpublished</Badge>}
                      {it.isBestSeller && <Badge tone="bestSeller">Best seller</Badge>}
                      {it.isTrending && <Badge tone="trending">Trending</Badge>}
                      {it.isFeatured && <Badge tone="featured">Featured</Badge>}
                      {it.isDemo && <Badge tone="demo">Demo</Badge>}
                    </div>
                  </td>
                  <td className="px-space-md py-space-sm">
                    <AvailabilityToggle itemId={it.id} name={it.name} available={it.isAvailable} />
                  </td>
                  <td className="px-space-md py-space-sm text-right">
                    <Link
                      href={`/admin/menu/${it.id}`}
                      aria-label={`Edit ${it.name}`}
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
      <Pagination
        page={query.page}
        totalPages={totalPages}
        basePath="/admin/menu"
        query={{
          q: query.q,
          category: query.category,
          status: query.status === 'all' ? undefined : query.status,
        }}
      />
    </>
  )
}
