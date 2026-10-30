import { Sparkles } from 'lucide-react'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site/seo'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { buttonClasses, LinkButton } from '@/components/ui/button'
import { FilterChip, PillLink, PillRow } from '@/components/ui/chip'
import { Container } from '@/components/ui/container'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState } from '@/components/ui/states'
import { todayHours } from '@/features/cafe/hours'
import { MenuCard } from '@/features/menu/menu-card'
import {
  DesktopFilters,
  MenuSearch,
  MobileFilters,
  SortControl,
  ViewToggle,
} from '@/features/menu/menu-controls'
import {
  activeFilterChips,
  menuHref,
  parseMenuParams,
  pickMenuParams,
} from '@/features/menu/menu-params'
import { RememberMenuUrl } from '@/features/menu/remember-menu-url'
import { MenuResultsSkeleton } from '@/features/menu/skeletons'
import { cn } from '@/lib/utils'
import { cachedCafe, cachedCategories, cachedMenu } from '@/server/public-data'

export const metadata: Metadata = pageMetadata({
  title: 'Digital Menu',
  description: 'Browse the ZORKO Sangli menu: search, filter by category, price and offers.',
  path: '/menu',
})

/** Digital menu (UI_SPEC §12.2). All state lives in the URL; results are rendered on the server. */
export default function MenuPage({ searchParams }: PageProps<'/menu'>) {
  return (
    <main id="main" className="flex-1">
      <div className="bg-surface-warm-cream">
        <Container className="flex flex-col gap-1 py-space-lg">
          <h1 className="text-headline-lg-mobile md:text-headline-lg">Digital Menu</h1>
          <p className="text-body-md text-on-surface-variant">
            Availability is updated live by café staff. Photos are illustrative.
          </p>
        </Container>
      </div>
      <Suspense fallback={<MenuResultsSkeleton />}>
        <MenuContent searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function MenuContent({ searchParams }: Pick<PageProps<'/menu'>, 'searchParams'>) {
  const { query, params } = parseMenuParams(pickMenuParams(await searchParams))
  await connection() // request time: "today's hours" below reads the current time
  const [categories, menu, cafe] = await Promise.all([
    cachedCategories(),
    cachedMenu(query),
    cachedCafe(),
  ])
  const { items, meta } = menu
  const categoryName = (slug: string) => categories.find((c) => c.slug === slug)?.name
  const chips = activeFilterChips(params, categoryName)
  const today = cafe ? todayHours(cafe) : null
  const totalItems = categories.reduce((n, c) => n + c.itemCount, 0)
  const list = params.view === 'list'

  return (
    <Container className="grid gap-space-lg py-space-lg lg:grid-cols-12 lg:py-space-xl">
      <RememberMenuUrl />
      {/* ---------------- aside (desktop) */}
      <aside className="hidden flex-col gap-space-md lg:sticky lg:top-32 lg:col-span-3 lg:flex lg:self-start">
        {cafe && today && (
          <div
            data-volatile
            className="rounded-2xl bg-gradient-to-br from-primary to-primary-container p-space-md text-on-primary shadow-sm"
          >
            <p className="text-label-lg">{cafe.openNow ? 'Open now' : 'Closed now'}</p>
            <p className="text-body-sm">
              {today.label ? `Today ${today.label}` : 'Closed today'}
              {!today.verified && ' (to be confirmed)'}
            </p>
          </div>
        )}
        <nav
          aria-label="Categories"
          className="rounded-2xl bg-surface-container-lowest p-space-sm shadow-sm"
        >
          <h2 className="px-2 pt-1 pb-space-sm text-headline-sm">Categories</h2>
          <ul className="flex flex-col gap-1">
            {[{ slug: undefined, name: 'All items', itemCount: totalItems }, ...categories].map(
              (c) => {
                const active = params.category === c.slug
                return (
                  <li key={c.slug ?? 'all'}>
                    <Link
                      href={menuHref(params, { category: c.slug })}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-10 items-center justify-between rounded-lg px-space-sm text-label-lg',
                        active
                          ? 'bg-primary text-on-primary'
                          : 'text-on-surface hover:bg-surface-container-low',
                      )}
                    >
                      {c.name}
                      <span className={active ? 'text-on-primary' : 'text-on-surface-variant'}>
                        {c.itemCount}
                      </span>
                    </Link>
                  </li>
                )
              },
            )}
          </ul>
        </nav>
        <section
          aria-labelledby="filters-heading"
          className="rounded-2xl bg-surface-container-lowest p-space-sm shadow-sm"
        >
          <div className="flex items-center justify-between px-2 pt-1 pb-space-xs">
            <h2 id="filters-heading" className="text-headline-sm">
              Filters
            </h2>
            <Link
              href={menuHref(params, { popular: undefined, offers: undefined, price: undefined })}
              className="text-label-md text-primary hover:underline"
            >
              Reset
            </Link>
          </div>
          <DesktopFilters params={params} />
        </section>
        {/* Help me choose entry point (UI_SPEC §12.12). */}
        <section
          aria-labelledby="choose-heading"
          className="flex flex-col gap-space-sm rounded-2xl bg-secondary-container/20 p-space-md shadow-sm"
        >
          <h2 id="choose-heading" className="flex items-center gap-2 text-headline-sm">
            <Sparkles aria-hidden="true" className="size-5 text-primary" />
            Not sure what to pick?
          </h2>
          <p className="text-body-sm text-on-surface-variant">
            Answer three quick questions and get five suggestions from the menu.
          </p>
          <LinkButton href="/help-me-choose" variant="secondary" size="sm">
            Help me choose
          </LinkButton>
        </section>
      </aside>

      {/* ---------------- main */}
      <div className="flex min-w-0 flex-col gap-space-md lg:col-span-9">
        <div className="flex flex-col gap-space-sm rounded-2xl bg-surface-container-lowest p-space-sm shadow-sm md:flex-row md:items-end md:p-space-md">
          <MenuSearch params={params} />
          <div className="flex items-end gap-space-sm">
            <div className="hidden w-52 lg:block">
              <SortControl params={params} />
            </div>
            <MobileFilters params={params} />
            <LinkButton
              href="/help-me-choose"
              variant="secondary"
              size="sm"
              className="lg:hidden"
              icon={<Sparkles aria-hidden="true" className="size-4" />}
            >
              Help me choose
            </LinkButton>
            <ViewToggle params={params} />
          </div>
        </div>

        <nav aria-label="Categories" className="-mx-margin md:-mx-margin-tablet lg:hidden">
          <PillRow className="px-margin md:px-margin-tablet">
            <PillLink
              href={menuHref(params, { category: undefined })}
              active={!params.category}
              scroll={false}
            >
              All
            </PillLink>
            {categories.map((c) => (
              <PillLink
                key={c.slug}
                href={menuHref(params, { category: c.slug })}
                active={params.category === c.slug}
                scroll={false}
              >
                {c.name}
              </PillLink>
            ))}
          </PillRow>
        </nav>

        <div className="flex flex-wrap items-center gap-space-sm">
          <p aria-live="polite" className="text-label-lg text-on-surface">
            Showing {meta.total} {meta.total === 1 ? 'item' : 'items'}
          </p>
          {chips.map((chip) => (
            <FilterChip key={chip.label} {...chip} />
          ))}
          {chips.length > 0 && (
            <Link
              href="/menu"
              className="inline-flex min-h-12 items-center text-label-md text-primary hover:underline lg:min-h-0"
            >
              Clear all
            </Link>
          )}
        </div>

        {items.length === 0 ? (
          <EmptyState
            title={meta.total > 0 ? 'This page is empty' : 'No dishes match these filters'}
            description={
              meta.total > 0
                ? 'There are fewer results than this page number.'
                : 'Try a different search or remove some filters.'
            }
            action={
              <Link
                href={meta.total > 0 ? menuHref(params) : '/menu'}
                className={buttonClasses({})}
              >
                {meta.total > 0 ? 'Go to the first page' : 'Clear all filters'}
              </Link>
            }
            className="rounded-2xl bg-surface-container-lowest shadow-sm"
          />
        ) : (
          <ul
            className={cn(
              list
                ? 'flex flex-col gap-space-sm'
                : 'grid grid-cols-2 gap-space-sm md:gap-space-md xl:grid-cols-3',
            )}
          >
            {items.map((item, i) => (
              <li key={item.id} className="flex">
                <MenuCard
                  item={item}
                  variant={list ? 'list' : 'grid'}
                  priority={i < 3}
                  headingLevel="h2"
                />
              </li>
            ))}
          </ul>
        )}

        {meta.totalPages > 1 && (
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            basePath="/menu"
            query={params}
          />
        )}
      </div>
    </Container>
  )
}
