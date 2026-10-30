import { Sparkles } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { RecoCardDto, RecoReasonDto } from '@/server/services/recommendations'
import { ImageFallback } from '../menu/category-icon'

/**
 * Shared recommendation UI (Phase R4, UI_SPEC §7.3 / §12.3 / §12.12). Server components: no client
 * JavaScript. Reason text comes only from the fixed reason list (RECOMMENDATION §6); nothing here
 * shows ratings, counts or demo feedback (NFR-014).
 */

/** Up to 2 reason chips: Sparkles icon + one truncated line. */
export function ReasonChips({
  reasons,
  className,
}: {
  reasons: RecoReasonDto[]
  className?: string
}) {
  if (reasons.length === 0) return null
  return (
    <ul aria-label="Why we suggest it" className={cn('flex min-w-0 flex-col', className)}>
      {reasons.slice(0, 2).map((r) => (
        <li
          key={r.code}
          className="flex min-w-0 items-center gap-1 text-body-sm text-on-surface-variant"
        >
          <Sparkles aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">{r.label}</span>
        </li>
      ))}
    </ul>
  )
}

/** Display-only flavour tags (max 5). Descriptive labels, not dietary claims (ADR-069). */
export function FlavourChips({ flavours, className }: { flavours: string[]; className?: string }) {
  if (flavours.length === 0) return null
  return (
    <ul aria-label="Flavours" className={cn('flex flex-wrap gap-1.5', className)}>
      {flavours.slice(0, 5).map((f) => (
        <li
          key={f}
          className="rounded-full bg-surface-container px-2.5 py-0.5 text-label-sm text-on-surface-variant"
        >
          {f}
        </li>
      ))}
    </ul>
  )
}

/** Compact row: 56 px thumbnail, name, reason chip, price (same card as the old related lists). */
function RecoRow({ item }: { item: RecoCardDto }) {
  return (
    <Link
      href={`/menu/${item.slug}`}
      className="flex min-h-12 items-center gap-space-sm rounded-xl p-1 hover:bg-surface-container-low"
    >
      <span className="relative size-14 shrink-0 overflow-hidden rounded-xl">
        {item.image ? (
          <Image src={item.image.url} alt="" fill sizes="56px" className="object-cover" />
        ) : (
          <ImageFallback />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-label-lg">{item.name}</span>
        <ReasonChips reasons={item.reasons.slice(0, 1)} />
      </span>
      <span className="font-heading text-headline-sm font-extrabold text-primary">
        {item.priceLabel}
      </span>
    </Link>
  )
}

/** "Goes well with" / "You may also like" card. Hidden when empty (RECOMMENDATION §4.7). */
export function RecoSection({
  id,
  title,
  items,
  footer,
}: {
  id: string
  title: string
  items: RecoCardDto[]
  footer?: ReactNode
}) {
  if (items.length === 0) return null
  return (
    <section
      aria-labelledby={id}
      data-testid="reco-section"
      className="rounded-3xl bg-surface-container-lowest p-space-lg shadow-sm"
    >
      <h2 id={id} className="text-headline-sm">
        {title}
      </h2>
      <ul className="mt-space-sm flex flex-col gap-1">
        {items.map((i) => (
          <li key={i.id}>
            <RecoRow item={i} />
          </li>
        ))}
      </ul>
      {footer}
    </section>
  )
}

/** Loading shape of the two sections: same card, 4 skeleton rows each. */
export function RecoSectionsSkeleton() {
  return (
    <>
      {[0, 1].map((s) => (
        <div
          key={s}
          aria-hidden="true"
          className="flex flex-col gap-space-sm rounded-3xl bg-surface-container-lowest p-space-lg shadow-sm"
        >
          <Skeleton className="h-6 w-40" />
          {[0, 1, 2, 3].map((r) => (
            <div key={r} className="flex items-center gap-space-sm p-1">
              <Skeleton className="size-14 shrink-0 rounded-xl" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      ))}
    </>
  )
}
