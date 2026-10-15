import { ExternalLink } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { BackLink } from '@/features/admin/menu/back-link'
import { ItemDangerZone } from '@/features/admin/menu/item-controls'
import { AddOnsEditor, ImagesPanel, RelationsEditor } from '@/features/admin/menu/item-extras'
import { ItemForm } from '@/features/admin/menu/item-form'
import { idSchema } from '@/lib/validation/admin-menu'
import { requireAdmin } from '@/server/auth/admin'
import { storageConfigured } from '@/server/media/storage'
import {
  getAdminItem,
  listCategoryOptions,
  listRelationOptions,
} from '@/server/services/admin-menu'

export const metadata: Metadata = { title: 'Edit menu item' }

export default function EditItemPage({ params, searchParams }: PageProps<'/admin/menu/[id]'>) {
  return (
    <div className="flex max-w-5xl flex-col gap-space-xl">
      <BackLink href="/admin/menu">All menu items</BackLink>
      <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
        <EditItem params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-space-md rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"
    >
      <h2 id={id} className="text-headline-sm">
        {title}
      </h2>
      {children}
    </section>
  )
}

async function EditItem({
  params,
  searchParams,
}: Pick<PageProps<'/admin/menu/[id]'>, 'params' | 'searchParams'>) {
  await connection()
  const { id } = await params
  await requireAdmin(`/admin/menu/${encodeURIComponent(id)}`)
  if (!idSchema.safeParse(id).success) notFound()
  const [item, categories, relationOptions, sp] = await Promise.all([
    getAdminItem(id),
    listCategoryOptions(),
    listRelationOptions(id),
    searchParams,
  ])
  if (!item) notFound()
  const isPublic = item.isPublished && !item.isArchived && !item.category.isArchived

  return (
    <>
      <header className="flex flex-col gap-space-sm">
        <h1 className="text-headline-lg-mobile md:text-headline-lg">{item.name}</h1>
        <div className="flex flex-wrap items-center gap-space-sm">
          {item.isArchived && <Badge tone="scheduled">Archived</Badge>}
          {!item.isPublished && <Badge tone="scheduled">Unpublished</Badge>}
          {item.category.isArchived && <Badge tone="scheduled">Category archived</Badge>}
          {item.isDemo && <Badge tone="demo">Demo data</Badge>}
          {isPublic ? (
            <a
              href={`/menu/${item.slug}`}
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
            Item created. Add images, add-ons and linked items below.
          </p>
        )}
      </header>

      <Panel id="details" title="Details">
        <ItemForm
          categories={categories}
          values={{
            id: item.id,
            name: item.name,
            description: item.description,
            pricePaise: item.pricePaise,
            categoryId: item.categoryId,
            dietType: item.dietType,
            isAvailable: item.isAvailable,
            isPublished: item.isPublished,
            isBestSeller: item.isBestSeller,
            isTrending: item.isTrending,
            isFeatured: item.isFeatured,
            sortOrder: item.sortOrder,
          }}
        />
      </Panel>

      <Panel id="images" title="Images">
        <ImagesPanel
          itemId={item.id}
          itemName={item.name}
          uploadsEnabled={storageConfigured()}
          images={item.images.map((i) => ({ id: i.id, url: i.url, altText: i.altText }))}
        />
      </Panel>

      <Panel id="addons" title="Add-ons">
        <AddOnsEditor
          itemId={item.id}
          groups={item.addOnGroups.map((g) => ({
            name: g.name,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            options: g.options.map((o) => ({
              name: o.name,
              priceDeltaPaise: o.priceDeltaPaise,
              isAvailable: o.isAvailable,
            })),
          }))}
        />
      </Panel>

      <Panel id="links" title="Linked items">
        <RelationsEditor
          itemId={item.id}
          options={relationOptions}
          related={item.related}
          together={item.together}
        />
      </Panel>

      <Panel id="archive" title={item.isArchived ? 'Restore or delete' : 'Archive'}>
        <ItemDangerZone
          itemId={item.id}
          name={item.name}
          isArchived={item.isArchived}
          offerCount={item.offerCount}
        />
      </Panel>
    </>
  )
}
