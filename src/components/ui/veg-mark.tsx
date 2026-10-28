import { cn } from '@/lib/utils'

export type DietType = 'VEG' | 'NON_VEG' | 'EGG'

const labels: Record<DietType, string> = {
  VEG: 'Vegetarian',
  NON_VEG: 'Non-vegetarian',
  EGG: 'Contains egg',
}

/**
 * Indian food-marking square (UI_SPEC §7.5): green dot = veg, red triangle = non-veg,
 * amber dot = egg. Driven by MenuItem.dietType.
 */
export function VegMark({
  diet,
  size = 'md',
  className,
}: {
  diet: DietType
  size?: 'sm' | 'md'
  className?: string
}) {
  const box = size === 'sm' ? 'size-3' : 'size-4'
  const colour =
    diet === 'VEG'
      ? 'border-veg-pure-green'
      : diet === 'NON_VEG'
        ? 'border-non-veg-red'
        : 'border-secondary'
  return (
    <span
      role="img"
      aria-label={labels[diet]}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[3px] border-[1.5px] bg-white',
        box,
        colour,
        className,
      )}
    >
      {diet === 'NON_VEG' ? (
        <span
          className={cn(
            'h-0 w-0 border-x-transparent border-b-non-veg-red',
            size === 'sm' ? 'border-x-[3px] border-b-[5px]' : 'border-x-4 border-b-[7px]',
          )}
        />
      ) : (
        <span
          className={cn(
            'rounded-full',
            size === 'sm' ? 'size-1.5' : 'size-2',
            diet === 'VEG' ? 'bg-veg-pure-green' : 'bg-secondary',
          )}
        />
      )}
    </span>
  )
}

/**
 * "100% VEG" claim pill. Renders only when the café has confirmed the outlet is fully
 * vegetarian (CafeInformation.isPureVegConfirmed, open question Q-06).
 */
export function PureVegPill({
  confirmed,
  className,
  tone = 'light',
}: {
  confirmed: boolean
  className?: string
  /** `dark` for black brand surfaces (header bar, footer): white pill, 6.75:1 (ADR-059). */
  tone?: 'light' | 'dark'
}) {
  if (!confirmed) return null
  return (
    <span
      className={cn(
        // Text uses tertiary (#006947): DESIGN.md's #15803D on this tint fails AA (UI_SPEC V-12).
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-label-sm whitespace-nowrap text-tertiary',
        tone === 'dark' ? 'bg-white' : 'bg-[rgba(16,185,129,0.12)]',
        className,
      )}
    >
      <VegMark diet="VEG" size="sm" />
      100% VEG
    </span>
  )
}
