import { Clock, Lock, MapPin, MessageCircle, Navigation, Phone } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { formatPhone } from '@/lib/format'
import { PureVegPill } from '@/components/ui/veg-mark'
import { DAY_NAMES, hoursLabel } from '@/features/cafe/hours'
import { liveMore, liveNav } from '@/lib/site/nav'
import type { CafeDto } from '@/server/services/cafe'
import { shortAddress } from './site-header'

const heading = 'font-heading text-headline-sm font-bold text-white'
const link =
  'inline-flex min-h-12 items-center text-body-md text-brand-ink-soft transition-colors hover:text-brand-orange lg:min-h-9'
const social =
  'inline-flex min-h-12 items-center gap-1.5 rounded-full border border-brand-orange px-space-md text-label-md text-white transition-colors hover:bg-brand-orange hover:text-brand-ink lg:min-h-10'

/**
 * Footer in the zorko.in style (UI_SPEC §8.3, ADR-059): the skyline wave on top, the outlet's own
 * details on black, the ZORKO food strip, and a plank band with the project notice. Every value
 * comes from the database and every link goes to a live page. The artwork is decorative (alt="").
 * Brand orange is used only on black here (6.97:1).
 */
export function SiteFooter({ cafe }: { cafe: CafeDto | null }) {
  const explore = liveNav().filter((i) => i.href !== '/')
  const socials = cafe
    ? [
        cafe.instagramUrl && { href: cafe.instagramUrl, label: 'Instagram' },
        cafe.facebookUrl && { href: cafe.facebookUrl, label: 'Facebook' },
        cafe.whatsappUrl && { href: cafe.whatsappUrl, label: 'WhatsApp chat' },
      ].filter((s): s is { href: string; label: string } => Boolean(s))
    : []

  return (
    <footer className="mt-space-2xl text-white">
      {/* The wave's sky is transparent, so it sits on whatever the page above uses. */}
      <Image
        src="/brand/footer-skyline.webp"
        alt=""
        width={1600}
        height={234}
        sizes="100vw"
        className="-mb-px block h-auto min-h-20 w-full object-cover object-left-bottom"
      />

      <div className="bg-brand-ink pt-space-lg pb-space-xl">
        <div className="mx-auto grid max-w-page gap-space-xl px-margin md:grid-cols-2 md:px-margin-tablet lg:grid-cols-12 lg:px-margin-desktop">
          <div className="flex flex-col items-start gap-space-md lg:col-span-4">
            <Image
              src="/logo-plain.webp"
              alt="ZORKO — Brand of Food Lovers"
              width={600}
              height={219}
              className="h-16 w-auto lg:h-20"
            />
            <p className="max-w-sm text-body-md text-brand-ink-soft">
              Digital menu, offers and café information for the ZORKO outlet in Sangli.
            </p>
            {cafe && <PureVegPill confirmed={cafe.isPureVegConfirmed} tone="dark" />}
            {socials.length > 0 && (
              <div className="flex flex-wrap gap-space-sm">
                {socials.map((s) => (
                  <a
                    key={s.href}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={social}
                  >
                    {s.label === 'WhatsApp chat' && (
                      <MessageCircle aria-hidden="true" className="size-4" />
                    )}
                    {s.label}
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <nav aria-label="Footer" className="flex flex-col gap-space-sm lg:col-span-2">
            <h2 className={heading}>Explore</h2>
            <ul className="flex flex-col">
              {explore.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={link}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {cafe && (
            <div className="flex flex-col gap-space-sm lg:col-span-3">
              <h2 className={heading}>Visit us</h2>
              <p className="flex gap-2 text-body-md text-brand-ink-soft">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-orange" />
                {shortAddress(cafe)}
              </p>
              {cafe.phone && (
                <a href={`tel:${cafe.phone}`} className={`${link} gap-2`}>
                  <Phone aria-hidden="true" className="size-4 text-brand-orange" />
                  {formatPhone(cafe.phone)}
                </a>
              )}
              {cafe.directionsUrl && (
                <a
                  href={cafe.directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${link} gap-2`}
                >
                  <Navigation aria-hidden="true" className="size-4 text-brand-orange" />
                  Directions on Google Maps
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
              <div className="flex gap-2 text-body-sm text-brand-ink-soft">
                <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-orange" />
                <div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-space-md gap-y-1 leading-snug">
                    {cafe.hours.map((d) => (
                      <div key={d.dayOfWeek} className="contents">
                        <dt>{DAY_NAMES[d.dayOfWeek].slice(0, 3)}</dt>
                        <dd>{hoursLabel(d) ?? 'Closed'}</dd>
                      </div>
                    ))}
                  </dl>
                  {!cafe.verified.hours && (
                    <p className="mt-1 text-brand-yellow">Hours to be confirmed by the café.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <nav aria-label="Quick links" className="flex flex-col gap-space-sm lg:col-span-3">
            <h2 className={heading}>Quick links</h2>
            <ul className="flex flex-col">
              {liveMore().map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={link}>
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/credits" className={link}>
                  Image credits
                </Link>
              </li>
              <li>
                {/* Staff entry point (ADR-055): only the sign-in page; access is decided on the server. */}
                <Link href="/admin/login" className={`${link} gap-2`}>
                  <Lock aria-hidden="true" className="size-4 text-brand-orange" />
                  Staff portal
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      {/* ZORKO food strip (zorko.in artwork): a taller crop on phones so the dishes stay visible. */}
      <div className="bg-brand-ink">
        <Image
          src="/brand/footer-food-mobile.webp"
          alt=""
          width={900}
          height={420}
          sizes="100vw"
          className="block h-auto w-full md:hidden"
        />
        <Image
          src="/brand/footer-food.webp"
          alt=""
          width={1600}
          height={263}
          sizes="100vw"
          className="hidden h-auto w-full md:block"
        />
      </div>
      <p className="bg-brand-plank px-margin py-space-sm text-center text-body-sm text-white md:px-margin-tablet">
        ZORKO Sangli — student project, not an official ZORKO website. Menu photos are illustrative.
      </p>
    </footer>
  )
}
