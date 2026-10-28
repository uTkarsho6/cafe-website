'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense } from 'react'
import { isActivePath, type NavItem } from '@/lib/site/nav'
import { cn } from '@/lib/utils'

/** Desktop nav pills (UI_SPEC §7.3 nav pill, §8.1). Shown at ≥1280 px. */
export function NavLinks({ items }: { items: NavItem[] }) {
  // usePathname must sit inside Suspense so routes can still be prerendered (Cache Components).
  return (
    <Suspense fallback={<NavLinksView items={items} pathname="" />}>
      <NavLinksLive items={items} />
    </Suspense>
  )
}

function NavLinksLive({ items }: { items: NavItem[] }) {
  return <NavLinksView items={items} pathname={usePathname()} />
}

function NavLinksView({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <nav aria-label="Main" className="hidden xl:block">
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href)
          return (
            <li key={item.href}>
              {/* Current page: orange text and underline bar on the black header (6.97:1, ADR-059). */}
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative inline-flex min-h-12 items-center px-space-sm font-heading text-label-lg whitespace-nowrap transition-colors',
                  'after:absolute after:inset-x-space-sm after:bottom-1 after:h-[3px] after:rounded-full after:bg-brand-orange after:transition-transform motion-reduce:after:transition-none',
                  active
                    ? 'font-bold text-brand-orange after:scale-x-100'
                    : 'text-brand-ink-soft after:scale-x-0 hover:text-white hover:after:scale-x-100',
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
