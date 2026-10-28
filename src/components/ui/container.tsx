import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Page container: max 1480px (token `max-w-page`), margins 16 / 24 / 40px (UI_SPEC §4). */
export function Container({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-page px-margin md:px-margin-tablet lg:px-margin-desktop',
        className,
      )}
      {...props}
    />
  )
}
