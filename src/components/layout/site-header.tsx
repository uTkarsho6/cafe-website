import { Clock, MapPin, Search } from 'lucide-react'
import Form from 'next/form'
import Link from 'next/link'
import { PureVegPill } from '@/components/ui/veg-mark'
import { todayHours } from '@/features/cafe/hours'
import { liveMore, liveNav } from '@/lib/site/nav'
import type { CafeDto } from '@/server/services/cafe'
import { Logo } from './logo'
import { MobileNav } from './mobile-nav'
import { NavLinks } from './nav-links'

/** Short location text; unconfirmed addresses are never shown as fact (CLAUDE.md §6.2). */
export function shortAddress(cafe: CafeDto): string {
  return cafe.verified.address
    ? `${cafe.addressLine}, ${cafe.city}`
    : `${cafe.city} · address to be confirmed`
}

function InfoBar({ cafe }: { cafe: CafeDto }) {
  const today = todayHours(cafe)
  return (
    <div className="hidden bg-surface-container-low md:block">
      <div className="mx-auto flex h-9 max-w-page items-center justify-between gap-space-md px-margin-tablet text-label-md text-on-surface-variant lg:px-margin-desktop">
        <div className="flex min-w-0 items-center gap-space-md">
          <PureVegPill confirmed={cafe.isPureVegConfirmed} />
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="truncate">{shortAddress(cafe)}</span>
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          <Clock aria-hidden="true" className="size-4 text-tertiary" />
          {!today
            ? 'Hours to be confirmed'
            : today.label
              ? `Open today: ${today.label}`
              : 'Closed today'}
          {today && !today.verified && (
            <span className="text-on-surface-variant">(to be confirmed)</span>
          )}
        </span>
      </div>
    </div>
  )
}

/**
 * Public header (UI_SPEC §8.1): sticky; info bar ≥768; nav pills ≥1280; drawer 768–1279;
 * compact row + bottom nav <768. `cafe` is null when the database is unavailable — the header
 * still renders so navigation keeps working.
 */
export function SiteHeader({ cafe }: { cafe: CafeDto | null }) {
  const nav = liveNav()
  return (
    <header className="sticky top-0 z-50 bg-surface/90 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
      {cafe && <InfoBar cafe={cafe} />}
      <div className="mx-auto flex h-16 max-w-page items-center justify-between gap-space-md px-margin md:h-20 md:px-margin-tablet lg:px-margin-desktop">
        <Logo />
        <NavLinks items={nav} />
        <div className="flex items-center gap-space-sm">
          <Form action="/menu" role="search" className="relative hidden sm:block">
            <label htmlFor="header-search" className="sr-only">
              Search the menu
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-space-md size-[18px] -translate-y-1/2 text-on-surface-variant"
            />
            <input
              id="header-search"
              type="search"
              name="q"
              maxLength={60}
              placeholder="Search burgers, pizza…"
              autoComplete="off"
              className="h-12 w-56 rounded-xl bg-surface-canvas-subtle pr-space-md pl-11 text-body-md placeholder:text-on-surface-variant focus:bg-white focus:outline-none focus-visible:ring-[1.5px] focus-visible:ring-primary lg:w-64"
            />
          </Form>
          <Link
            href="/menu#menu-search"
            aria-label="Search the menu"
            className="inline-flex size-12 items-center justify-center rounded-full bg-surface-container text-on-surface sm:hidden"
          >
            <Search aria-hidden="true" className="size-5" />
          </Link>
          <MobileNav items={[...nav, ...liveMore()]} />
        </div>
      </div>
    </header>
  )
}
