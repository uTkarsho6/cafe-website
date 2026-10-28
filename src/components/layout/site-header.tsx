import { Clock, MapPin, Phone, Search } from 'lucide-react'
import Form from 'next/form'
import Link from 'next/link'
import { PureVegPill } from '@/components/ui/veg-mark'
import { todayHours } from '@/features/cafe/hours'
import { formatPhone } from '@/lib/format'
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

/** Info line (≥768 px): the top part of the one black header block (ADR-059). */
function InfoBar({ cafe }: { cafe: CafeDto }) {
  const today = todayHours(cafe)
  return (
    <div className="hidden border-b border-white/10 text-brand-ink-soft md:block">
      <div className="mx-auto flex h-9 max-w-page items-center justify-between gap-space-md px-margin-tablet text-label-md lg:px-margin-desktop">
        <div className="flex min-w-0 items-center gap-space-md">
          <PureVegPill confirmed={cafe.isPureVegConfirmed} tone="dark" />
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin aria-hidden="true" className="size-4 shrink-0 text-brand-orange" />
            <span className="truncate">{shortAddress(cafe)}</span>
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          <Clock aria-hidden="true" className="size-4 text-brand-yellow" />
          {!today
            ? 'Hours to be confirmed'
            : today.label
              ? `Open today: ${today.label}`
              : 'Closed today'}
          {today && !today.verified && <span className="text-brand-yellow">(to be confirmed)</span>}
        </span>
      </div>
    </div>
  )
}

/**
 * Public header (UI_SPEC §8.1, ADR-059): one black block — info line (≥768) and main row with the
 * official logo, text nav (current page in orange with an orange underline, ≥1280), a dark search
 * field and an orange "Call" button when the café has a phone number — closed by an orange rule.
 * Orange is 6.97:1 on black; focus outlines switch to orange inside the header for the same
 * reason. Drawer 768–1279; compact row + bottom nav <768. `cafe` is null when the database is
 * unavailable — the header still renders so navigation keeps working.
 */
export function SiteHeader({ cafe }: { cafe: CafeDto | null }) {
  const nav = liveNav()
  return (
    <header className="sticky top-0 z-50 bg-brand-ink text-white shadow-header [&_:focus-visible]:outline-brand-orange">
      {cafe && <InfoBar cafe={cafe} />}
      <div className="mx-auto flex h-16 max-w-page items-center justify-between gap-space-md px-margin md:h-20 md:px-margin-tablet lg:px-margin-desktop">
        <Logo tone="dark" />
        <NavLinks items={nav} />
        <div className="flex items-center gap-space-sm">
          <Form action="/menu" role="search" className="relative hidden sm:block">
            <label htmlFor="header-search" className="sr-only">
              Search the menu
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-space-md size-[18px] -translate-y-1/2 text-brand-ink-soft"
            />
            <input
              id="header-search"
              type="search"
              name="q"
              maxLength={60}
              placeholder="Search burgers, pizza…"
              autoComplete="off"
              className="h-12 w-52 rounded-full border border-white/15 bg-brand-ink-raised pr-space-md pl-11 text-body-md text-white placeholder:text-brand-ink-soft focus:border-brand-orange focus:outline-none focus-visible:ring-[1.5px] focus-visible:ring-brand-orange lg:w-60"
            />
          </Form>
          <Link
            href="/menu#menu-search"
            aria-label="Search the menu"
            className="inline-flex size-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:hidden"
          >
            <Search aria-hidden="true" className="size-5" />
          </Link>
          {cafe?.phone && (
            <a
              href={`tel:${cafe.phone}`}
              aria-label={`Call the café: ${formatPhone(cafe.phone)}`}
              className="hidden min-h-12 items-center gap-2 rounded-full bg-brand-orange px-space-md text-label-lg font-bold text-brand-ink transition-colors hover:bg-brand-yellow lg:inline-flex"
            >
              <Phone aria-hidden="true" className="size-4" />
              Call
            </a>
          )}
          <MobileNav items={[...nav, ...liveMore()]} />
        </div>
      </div>
      <div aria-hidden="true" className="h-[3px] bg-brand-orange" />
    </header>
  )
}
