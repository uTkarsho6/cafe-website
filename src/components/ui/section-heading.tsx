import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  eyebrow?: string
  title: string
  description?: ReactNode
  /** Right-aligned action on desktop, e.g. a "See full menu" link. */
  action?: ReactNode
  as?: 'h1' | 'h2' | 'h3'
  className?: string
}

/** Section heading block from the Stitch home/offers sections (UI_SPEC §4 rhythm). */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  as: Heading = 'h2',
  className,
}: Props) {
  return (
    <div
      className={cn(
        'mb-space-xl flex flex-col justify-between gap-space-sm md:flex-row md:items-end',
        className,
      )}
    >
      <div className="flex flex-col gap-space-xs">
        {/* Same eyebrow as the hero: brown spaced capitals, no decorative rule (ADR-063). */}
        {eyebrow && (
          <p className="text-label-sm tracking-[0.14em] text-primary uppercase">{eyebrow}</p>
        )}
        <Heading className="text-headline-lg-mobile text-on-surface md:text-headline-lg">
          {title}
        </Heading>
        {description && (
          <p className="max-w-xl text-body-md text-on-surface-variant">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
