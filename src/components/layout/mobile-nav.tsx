'use client'

import { Menu } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { isActivePath, type NavItem } from '@/lib/site/nav'
import { cn } from '@/lib/utils'
import { StaffLink } from './staff-link'

/** Menu button + drawer for 768–1279 px (UI_SPEC §8.1, ADR-024). */
export function MobileNav({ items }: { items: NavItem[] }) {
  return (
    <Suspense fallback={<MobileNavView items={items} pathname="" />}>
      <MobileNavLive items={items} />
    </Suspense>
  )
}

function MobileNavLive({ items }: { items: NavItem[] }) {
  return <MobileNavView items={items} pathname={usePathname()} />
}

function MobileNavView({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="site-nav-drawer"
        onClick={() => setOpen(true)}
        className="hidden size-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 md:inline-flex xl:hidden"
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Menu" placement="sheet">
        <nav id="site-nav-drawer" aria-label="Main">
          <ul className="flex flex-col gap-1">
            {items.map((item) => {
              const active = isActivePath(pathname, item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-12 items-center rounded-xl px-space-md text-label-lg',
                      active
                        ? 'bg-primary-container text-on-primary-container'
                        : 'text-on-surface hover:bg-surface-container',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
          <StaffLink onNavigate={() => setOpen(false)} />
        </nav>
      </Dialog>
    </>
  )
}
