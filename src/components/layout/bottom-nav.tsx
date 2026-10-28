'use client'

import { Ellipsis, GraduationCap, House, Tag, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { isActivePath, type NavItem } from '@/lib/site/nav'
import { cn } from '@/lib/utils'
import { StaffLink } from './staff-link'

const ICONS: Record<string, LucideIcon> = {
  '/': House,
  '/menu': UtensilsCrossed,
  '/offers': Tag,
  '/student-zone': GraduationCap,
}
const PRIMARY = ['/', '/menu', '/offers', '/student-zone']

const itemClass =
  'flex min-h-12 min-w-14 flex-1 flex-col items-center justify-center gap-0.5 text-label-md'

/**
 * Mobile bottom navigation (<768 px, UI_SPEC §8.2): Home · Menu · Offers · Students · More.
 * Only live pages are shown; "More" appears once it has at least one live page.
 */
export function BottomNav(props: { items: NavItem[]; more: NavItem[] }) {
  return (
    <Suspense fallback={<BottomNavView {...props} pathname="" />}>
      <BottomNavLive {...props} />
    </Suspense>
  )
}

function BottomNavLive(props: { items: NavItem[]; more: NavItem[] }) {
  return <BottomNavView {...props} pathname={usePathname()} />
}

function BottomNavView({
  items,
  more,
  pathname,
}: {
  items: NavItem[]
  more: NavItem[]
  pathname: string
}) {
  const [open, setOpen] = useState(false)
  const primary = items.filter((i) => PRIMARY.includes(i.href))
  const extra = [...items.filter((i) => !PRIMARY.includes(i.href)), ...more]

  return (
    <nav
      aria-label="Bottom"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-container bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.05)] backdrop-blur-xl md:hidden"
    >
      <ul className="flex h-16 items-stretch">
        {primary.map((item) => {
          const Icon = ICONS[item.href]
          const active = isActivePath(pathname, item.href)
          return (
            <li key={item.href} className="flex flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  itemClass,
                  active ? 'font-bold text-primary' : 'text-on-surface-variant',
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                {item.shortLabel ?? item.label}
              </Link>
            </li>
          )
        })}
        {extra.length > 0 && (
          <li className="flex flex-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              className={cn(itemClass, 'text-on-surface-variant')}
            >
              <Ellipsis aria-hidden="true" className="size-5" />
              More
            </button>
          </li>
        )}
      </ul>
      {extra.length > 0 && (
        <Dialog open={open} onClose={() => setOpen(false)} title="More" placement="sheet">
          <ul className="flex flex-col gap-1">
            {extra.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center rounded-xl px-space-md text-label-lg hover:bg-surface-container"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <StaffLink onNavigate={() => setOpen(false)} />
        </Dialog>
      )}
    </nav>
  )
}
