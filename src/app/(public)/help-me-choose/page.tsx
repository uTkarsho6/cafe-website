import { Sparkles } from 'lucide-react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { buttonClasses } from '@/components/ui/button'
import { Container } from '@/components/ui/container'
import { MenuCardSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/states'
import { pageMetadata } from '@/lib/site/seo'
import { ImageFallback } from '@/features/menu/category-icon'
import { MenuCard } from '@/features/menu/menu-card'
import { ChooseForm } from '@/features/reco/choose-form'
import { chooseHref, parseChooseParams, type ChooseParams } from '@/features/reco/choose-params'
import { FlavourChips, ReasonChips } from '@/features/reco/reco-parts'
import { cachedSuggestions } from '@/server/public-data'
import type { SuggestionDto } from '@/server/services/recommendations'

export const metadata: Metadata = pageMetadata({
  title: 'Help me choose',
  description:
    'Not sure what to order at ZORKO Sangli? Answer three quick questions and get five dishes from the menu.',
  path: '/help-me-choose',
})

/**
 * Help me choose (UI_SPEC §12.12, FR-065). Server-rendered from the URL: the answers are a
 * temporary taste profile, nothing about the guest is stored. Only available dishes are suggested.
 */
export default function HelpMeChoosePage({ searchParams }: PageProps<'/help-me-choose'>) {
  return (
    <main id="main" className="flex-1">
      <div className="bg-surface-warm-cream">
        <Container className="flex flex-col gap-1 py-space-lg">
          <h1 className="text-headline-lg-mobile md:text-headline-lg">Help me choose</h1>
          <p className="text-body-md text-on-surface-variant">
            Answer three quick questions and we will suggest dishes from today&apos;s menu.
          </p>
        </Container>
      </div>
      <Container className="flex flex-col gap-space-lg py-space-lg lg:py-space-xl">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-body-sm text-on-surface-variant">
            <li>
              <Link
                href="/"
                className="inline-flex min-h-12 min-w-12 items-center hover:text-primary lg:min-h-0 lg:min-w-0"
              >
                Home
              </Link>{' '}
              /
            </li>
            <li>
              <Link
                href="/menu"
                className="inline-flex min-h-12 min-w-12 items-center hover:text-primary lg:min-h-0 lg:min-w-0"
              >
                Digital Menu
              </Link>{' '}
              /
            </li>
            <li aria-current="page" className="text-on-surface">
              Help me choose
            </li>
          </ol>
        </nav>
        <Suspense fallback={<ResultsSkeleton />}>
          <ChooseContent searchParams={searchParams} />
        </Suspense>
      </Container>
    </main>
  )
}

async function ChooseContent({ searchParams }: Pick<PageProps<'/help-me-choose'>, 'searchParams'>) {
  const params = parseChooseParams(await searchParams)
  // The key remounts the form when the URL changes (e.g. "Start over"), so ticks match the URL.
  const formKey = chooseHref(params) + String(params.tooManyTags)
  return (
    <>
      <ChooseForm key={formKey} params={params} />
      {params.mood && !params.tooManyTags ? (
        <Results params={params} />
      ) : (
        <p className="text-body-md text-on-surface-variant">
          Pick what you are in the mood for, then press <strong>Show suggestions</strong>. Only
          dishes that are available right now are suggested.
        </p>
      )}
    </>
  )
}

async function Results({ params }: { params: ChooseParams }) {
  await connection() // request time: the ranking uses the current time of day
  const suggestions = await cachedSuggestions({
    mood: params.mood!,
    budget: params.budget,
    tags: params.tags,
  })
  const count = suggestions.length
  return (
    <section aria-labelledby="results-heading" className="flex flex-col gap-space-md">
      <h2 id="results-heading" aria-live="polite" className="text-headline-md">
        {count === 0
          ? 'No suggestions'
          : `${count} ${count === 1 ? 'suggestion' : 'suggestions'} for you`}
      </h2>
      {count === 0 ? (
        <EmptyState
          title="Nothing matches all three answers"
          description="Try fewer flavours or another budget."
          action={
            <div className="flex flex-wrap justify-center gap-space-sm">
              {params.tags.length > 0 && (
                <Link
                  href={chooseHref({ mood: params.mood, budget: params.budget })}
                  className={buttonClasses({})}
                >
                  Remove flavours
                </Link>
              )}
              <Link href="/help-me-choose" className={buttonClasses({ variant: 'secondary' })}>
                Start over
              </Link>
            </div>
          }
          className="rounded-2xl bg-surface-container-lowest shadow-sm"
        />
      ) : (
        <ul className="grid grid-cols-2 gap-space-sm md:gap-space-md xl:grid-cols-3">
          {suggestions.map((s, i) => (
            <li
              key={s.item.id}
              data-testid="suggestion"
              data-price={s.item.pricePaise}
              className="flex flex-col gap-space-xs"
            >
              <MenuCard
                item={s.item}
                priority={i < 3}
                extra={
                  <>
                    <ReasonChips reasons={s.item.reasons} />
                    <FlavourChips flavours={s.flavours} className="hidden md:flex" />
                  </>
                }
              />
              <Pairing suggestion={s} />
            </li>
          ))}
        </ul>
      )}
      {count > 0 && (
        <p className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
          <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
          Suggestions are generated automatically from our menu. Prices are today&apos;s menu
          prices.
        </p>
      )}
    </section>
  )
}

/** "Pairs well with" row for a meal: the side or drink and the real sum of today's prices. */
function Pairing({ suggestion: s }: { suggestion: SuggestionDto }) {
  if (!s.pairWith) return null
  const p = s.pairWith
  return (
    <div
      data-testid="pairing"
      className="flex flex-col gap-1 rounded-xl bg-surface-canvas-subtle p-space-sm"
    >
      <Link
        href={`/menu/${p.slug}`}
        className="flex min-h-12 items-center gap-space-sm rounded-lg hover:bg-surface-container-low"
      >
        <span className="relative size-10 shrink-0 overflow-hidden rounded-lg">
          {p.image ? (
            <Image src={p.image.url} alt="" fill sizes="40px" className="object-cover" />
          ) : (
            <ImageFallback />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body-sm text-on-surface-variant">Pairs well with</span>
          <span className="truncate text-label-md text-on-surface">
            {p.name}{' '}
            <span data-testid="pair-price" className="text-primary">
              {p.priceLabel}
            </span>
          </span>
        </span>
      </Link>
      <p className="text-body-sm text-on-surface">
        Together{' '}
        <strong data-testid="pair-total" className="font-heading text-primary">
          {s.pairTotalLabel}
        </strong>
      </p>
    </div>
  )
}

function ResultsSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-2 gap-space-sm md:gap-space-md xl:grid-cols-3"
    >
      {[0, 1, 2].map((i) => (
        <MenuCardSkeleton key={i} />
      ))}
    </div>
  )
}
