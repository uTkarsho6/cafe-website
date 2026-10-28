import { Clock, Lock, MapPin, MessageCircle, Phone } from 'lucide-react'
import Link from 'next/link'
import { formatPhone } from '@/lib/format'
import { PureVegPill } from '@/components/ui/veg-mark'
import { DAY_NAMES, hoursLabel } from '@/features/cafe/hours'
import { liveMore, liveNav } from '@/lib/site/nav'
import type { CafeDto } from '@/server/services/cafe'
import { shortAddress } from './site-header'

const pill =
  'inline-flex min-h-12 items-center gap-1.5 rounded-full bg-surface-container px-space-md text-label-md text-on-surface hover:bg-surface-container-high lg:min-h-10'

/** Footer (UI_SPEC §8.3). Every value comes from the database; links only to live pages. */
export function SiteFooter({ cafe }: { cafe: CafeDto | null }) {
  const links = [...liveNav().filter((i) => i.href !== '/'), ...liveMore()]
  const socials = cafe
    ? [
        cafe.instagramUrl && { href: cafe.instagramUrl, label: 'Instagram' },
        cafe.facebookUrl && { href: cafe.facebookUrl, label: 'Facebook' },
        cafe.whatsappUrl && { href: cafe.whatsappUrl, label: 'WhatsApp chat' },
      ].filter((s): s is { href: string; label: string } => Boolean(s))
    : []

  return (
    <footer className="bg-surface-warm-cream pt-space-2xl pb-space-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="mx-auto grid max-w-page gap-space-xl px-margin md:grid-cols-2 md:px-margin-tablet lg:grid-cols-4 lg:px-margin-desktop">
        <div className="flex flex-col gap-space-sm">
          <p className="font-heading text-headline-sm font-extrabold">ZORKO Sangli</p>
          <p className="text-body-sm text-on-surface-variant">
            Digital menu, offers and café information for the ZORKO outlet in Sangli.
          </p>
          {cafe && <PureVegPill confirmed={cafe.isPureVegConfirmed} />}
        </div>

        {cafe && (
          <div className="flex flex-col gap-space-sm">
            <h2 className="text-headline-sm">Outlet location &amp; hours</h2>
            <p className="flex gap-2 text-body-sm text-on-surface-variant">
              <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" />
              {shortAddress(cafe)}
            </p>
            <div className="flex gap-2 text-body-sm text-on-surface-variant">
              <Clock aria-hidden="true" className="size-4 shrink-0 text-tertiary" />
              <dl className="grid grid-cols-[auto_1fr] gap-x-space-sm">
                {cafe.hours.map((d) => (
                  <div key={d.dayOfWeek} className="contents">
                    <dt>{DAY_NAMES[d.dayOfWeek].slice(0, 3)}</dt>
                    <dd>{hoursLabel(d) ?? 'Closed'}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {!cafe.verified.hours && (
              <p className="text-body-sm text-on-surface-variant">
                Hours to be confirmed by the café.
              </p>
            )}
            {cafe.phone && (
              <a
                href={`tel:${cafe.phone}`}
                className="flex min-h-12 items-center gap-2 text-label-md text-primary hover:underline lg:min-h-0"
              >
                <Phone aria-hidden="true" className="size-4" />
                {formatPhone(cafe.phone)}
              </a>
            )}
          </div>
        )}

        <nav aria-label="Footer" className="flex flex-col gap-space-sm">
          <h2 className="text-headline-sm">Explore</h2>
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="inline-flex min-h-12 items-center text-body-md text-on-surface-variant hover:text-primary lg:min-h-9"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {socials.length > 0 && (
          <div className="flex flex-col gap-space-sm">
            <h2 className="text-headline-sm">Connect</h2>
            <div className="flex flex-wrap gap-space-sm">
              {socials.map((s) => (
                <a
                  key={s.href}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={pill}
                >
                  {s.label === 'WhatsApp chat' && (
                    <MessageCircle aria-hidden="true" className="size-4" />
                  )}
                  {s.label}
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="mx-auto mt-space-xl max-w-page px-margin text-body-sm text-on-surface-variant md:px-margin-tablet lg:px-margin-desktop">
        ZORKO Sangli — student project, not an official ZORKO website. Menu photos are illustrative
        ·{' '}
        <Link
          href="/credits"
          className="inline-flex min-h-12 items-center underline hover:text-primary lg:min-h-0"
        >
          Image credits
        </Link>{' '}
        ·{' '}
        {/* Staff entry point (ADR-055). Only the sign-in page; access is still decided on the server. */}
        <Link
          href="/admin/login"
          className="inline-flex min-h-12 items-center gap-1 underline hover:text-primary lg:min-h-0"
        >
          <Lock aria-hidden="true" className="size-3.5" />
          Staff portal
        </Link>
      </p>
    </footer>
  )
}
