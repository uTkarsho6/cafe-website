import { Info } from 'lucide-react'

/** Shown while the café data is seeded demo content (FR-024, CLAUDE.md §14). */
export function DemoRibbon() {
  return (
    <div role="note" className="bg-inverse-surface text-inverse-on-surface">
      <p className="mx-auto flex max-w-page items-center gap-2 px-margin py-2 text-body-sm md:px-margin-tablet lg:px-margin-desktop">
        <Info aria-hidden="true" className="size-4 shrink-0" />
        Demo data: menu items, prices, offers and café details are placeholders, not real
        information.
      </p>
    </div>
  )
}
