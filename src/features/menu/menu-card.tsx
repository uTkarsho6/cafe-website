import { Flame } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { AvailabilityLabel, Badge } from '@/components/ui/badge'
import { Price } from '@/components/ui/price'
import { VegMark, type DietType } from '@/components/ui/veg-mark'
import { buttonClasses } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MenuItemCardDto } from '@/server/services/menu'
import { ImageFallback } from './category-icon'

type Variant = 'grid' | 'list' | 'trending'

/** One badge, by priority: Out of stock > Best seller > Offer > Trending (UI_SPEC §7.6). */
function TopBadge({ item }: { item: MenuItemCardDto }) {
  if (!item.isAvailable) return null // shown as the centred overlay instead
  if (item.isBestSeller)
    return (
      <Badge tone="bestSeller" icon={<Flame aria-hidden="true" className="size-3" />}>
        Best seller
      </Badge>
    )
  if (item.hasActiveOffer) return <Badge tone="offer">Offer</Badge>
  if (item.isTrending) return <Badge tone="trending">Trending</Badge>
  return null
}

/**
 * Menu card (UI_SPEC §7.6). The title link stretches over the whole card (one link per card, no
 * nested links); "View details" repeats it visually. Unavailable items: greyscale image only,
 * solid "Out of stock" label, text keeps full contrast (V-13).
 *
 * `grid` collapses to the compact 2-column mobile card below 768 px (UI_SPEC §12.2).
 */
export function MenuCard({
  item,
  variant = 'grid',
  priority = false,
  headingLevel: H = 'h3',
}: {
  item: MenuItemCardDto
  variant?: Variant
  priority?: boolean
  headingLevel?: 'h2' | 'h3'
}) {
  const list = variant === 'list'
  return (
    <article
      className={cn(
        // ADR-060: a fine border instead of a drop shadow; orange border on hover.
        'group relative flex w-full rounded-2xl border border-border bg-surface-container-lowest transition-colors hover:border-cta',
        list ? 'flex-row gap-space-md p-space-sm sm:p-space-md' : 'flex-col p-2 md:p-space-md',
        variant === 'trending' && 'overflow-hidden p-0 md:p-0',
      )}
      data-testid="menu-card"
    >
      <div
        className={cn(
          'relative shrink-0 overflow-hidden',
          list && 'size-24 rounded-xl sm:size-32',
          variant === 'grid' && 'aspect-square rounded-xl md:aspect-auto md:h-44',
          variant === 'trending' && 'aspect-[4/3]',
        )}
      >
        {item.image ? (
          <Image
            src={item.image.url}
            alt={item.image.altText}
            fill
            priority={priority}
            sizes={list ? '128px' : '(min-width: 1280px) 300px, (min-width: 768px) 45vw, 50vw'}
            className={cn(
              'object-cover transition-transform duration-300 motion-safe:group-hover:scale-105',
              !item.isAvailable && 'opacity-60 grayscale',
            )}
          />
        ) : (
          <ImageFallback />
        )}
        <span className="absolute top-2 left-2 rounded-full bg-surface-container-lowest/90 p-1">
          <VegMark diet={item.dietType as DietType} size="sm" />
        </span>
        {!list && (
          <span className="absolute top-2 right-2">
            <TopBadge item={item} />
          </span>
        )}
        {!item.isAvailable && (
          <span className="absolute inset-x-0 top-1/2 mx-auto w-max -translate-y-1/2 rounded-full bg-inverse-surface px-3 py-1 text-label-md text-inverse-on-surface">
            Out of stock
          </span>
        )}
      </div>

      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col gap-1',
          !list && 'pt-space-sm',
          variant === 'trending' && 'p-space-sm md:p-space-md',
        )}
      >
        {list && <TopBadge item={item} />}
        <H className="line-clamp-2 text-[15px] leading-5 font-bold md:text-headline-sm">
          <Link
            href={`/menu/${item.slug}`}
            data-stretched-link
            className="rounded-sm after:absolute after:inset-0 after:rounded-2xl after:content-['']"
          >
            {item.name}
          </Link>
        </H>
        <p
          className={cn(
            'line-clamp-2 text-body-sm text-on-surface-variant',
            !list && 'hidden md:block',
          )}
        >
          {item.description}
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-space-sm gap-y-1 pt-space-xs">
          <div className="flex flex-col">
            <span className="hidden text-body-sm text-on-surface-variant md:block">
              {item.category.name}
            </span>
            <Price paise={item.pricePaise} />
          </div>
          <span className="md:hidden">
            <AvailabilityLabel available={item.isAvailable} />
          </span>
          {/* Decorative copy of the card link; hidden on the compact mobile card (UI_SPEC §12.2). */}
          <span aria-hidden="true" className="hidden md:block">
            <span
              className={buttonClasses({
                variant: 'ghost',
                size: 'sm',
                disabled: !item.isAvailable,
              })}
            >
              {item.isAvailable ? 'View details' : 'Out of stock — view details'}
            </span>
          </span>
        </div>
      </div>
    </article>
  )
}
