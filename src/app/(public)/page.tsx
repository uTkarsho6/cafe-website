import {
  ArrowRight,
  Clock,
  GraduationCap,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  QrCode,
  Search,
  Tag,
  UtensilsCrossed,
  Zap,
} from 'lucide-react'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site/seo'
import Image from 'next/image'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { buttonClasses, LinkButton } from '@/components/ui/button'
import { Container } from '@/components/ui/container'
import { SectionHeading } from '@/components/ui/section-heading'
import { categoryPhoto } from '@/features/menu/category-photos'
import { Skeleton } from '@/components/ui/skeleton'
import { shortAddress } from '@/components/layout/site-header'
import { DAY_NAMES, hoursLabel, todayHours } from '@/features/cafe/hours'
import { MapEmbed } from '@/features/cafe/map-embed'
import { ReviewList } from '@/features/cafe/review-list'
import { CategoryIcon } from '@/features/menu/category-icon'
import { MenuCard } from '@/features/menu/menu-card'
import { formatDateIST, formatPhone, formatRupees } from '@/lib/format'
import { isLive } from '@/lib/site/nav'
import {
  cachedCafe,
  cachedCategories,
  cachedHomeExtras,
  cachedMenu,
  cachedOffers,
} from '@/server/public-data'
import type { CafeDto } from '@/server/services/cafe'
import type { OfferDto } from '@/server/services/offers'

export const metadata: Metadata = pageMetadata({
  title: 'ZORKO Sangli — Digital Menu, Offers & Café Info',
  description: 'Browse the ZORKO Sangli digital menu, current offers and café information.',
  path: '/',
  absoluteTitle: true,
})

/** Homepage (UI_SPEC §12.1). Sections without real data are left out rather than faked. */
/** Licence and credit: src/lib/site/image-credits.json (shown on /credits). */
const HERO_FALLBACK = {
  url: '/stock/burger-tikki.webp',
  altText: 'A veg burger with cheese, tomato and lettuce (illustrative photo)',
}

export default function HomePage() {
  return (
    <main id="main" className="flex-1">
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>
    </main>
  )
}

function HomeSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading…
      </span>
      <Container className="grid gap-space-xl py-space-2xl lg:grid-cols-12">
        <div className="flex flex-col gap-space-md lg:col-span-7">
          <Skeleton className="h-8 w-48 rounded-full" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-12 w-72 rounded-full" />
        </div>
        <Skeleton className="aspect-[4/5] w-full max-w-[460px] rounded-3xl lg:col-span-5" />
      </Container>
    </div>
  )
}

async function HomeContent() {
  await connection() // request-time data (never during `next build`)
  const [cafe, categories, trending, offers, extras] = await Promise.all([
    cachedCafe(),
    cachedCategories(),
    cachedMenu({ q: undefined, popular: '1', sort: 'popular', page: 1, pageSize: 4 }),
    cachedOffers(),
    cachedHomeExtras(),
  ])
  const combos = offers.active.filter((o) => o.kind === 'COMBO')
  const featuredCombo =
    combos.find((o) => o.isFeatured && !o.isStudentOffer) ?? combos.find((o) => !o.isStudentOffer)
  const studentOffers = offers.active.filter((o) => o.isStudentOffer).slice(0, 2)
  const minCombo = combos.reduce<number | null>(
    (min, o) =>
      o.promoPricePaise !== null && (min === null || o.promoPricePaise < min)
        ? o.promoPricePaise
        : min,
    null,
  )
  // An admin banner image wins; otherwise a fixed illustrative burger photo (Stitch hero), so the
  // hero never depends on whichever dish happens to be first in "popular".
  const heroImage = extras.banners.find((b) => b.image)?.image ?? HERO_FALLBACK

  return (
    <>
      <Hero cafe={cafe} itemCount={extras.itemCount} heroImage={heroImage} />
      <FactsStrip cafe={cafe} minComboPaise={minCombo} />

      {extras.banners.length > 0 && (
        <section aria-label="Promotions" className="py-space-xl">
          <Container>
            <ul className="no-scrollbar flex snap-x snap-mandatory gap-space-md overflow-x-auto">
              {extras.banners.map((b) => (
                <li
                  key={b.id}
                  className="relative min-h-48 w-[85%] shrink-0 snap-start overflow-hidden rounded-3xl bg-surface-container md:w-[60%]"
                >
                  {b.image && (
                    <Image
                      src={b.image.url}
                      alt={b.image.altText}
                      fill
                      sizes="(min-width: 768px) 60vw, 85vw"
                      className="object-cover"
                    />
                  )}
                  <div className="relative flex h-full flex-col justify-end gap-1 bg-gradient-to-t from-black/75 to-transparent p-space-lg text-on-primary">
                    <h2 className="text-headline-md">{b.title}</h2>
                    {b.subtitle && <p className="text-body-md">{b.subtitle}</p>}
                    {b.ctaHref && b.ctaLabel && (
                      <a
                        href={b.ctaHref}
                        className={buttonClasses({
                          variant: 'inverse',
                          size: 'sm',
                          className: 'mt-space-sm self-start',
                        })}
                      >
                        {b.ctaLabel}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}

      {categories.some((c) => c.itemCount > 0) && (
        <section className="bg-surface py-space-2xl">
          <Container>
            <SectionHeading
              eyebrow="Explore menu categories"
              title="Craving Something Delicious?"
              action={
                <Link
                  href="/menu"
                  className="inline-flex min-h-12 items-center gap-1 text-label-lg text-primary hover:underline"
                >
                  See full menu <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              }
            />
            <ul className="grid grid-cols-2 gap-space-sm sm:grid-cols-3 md:grid-cols-4 md:gap-space-md lg:grid-cols-6">
              {/* Categories with no visible items are skipped here so a card never leads to an
                  empty list; the menu page still lists every category. */}
              {categories
                .filter((c) => c.itemCount > 0)
                .map((c) => {
                  const photo = categoryPhoto(c.slug)
                  return (
                    <li key={c.slug}>
                      {/* Whole card is the link (ADR-060): photo (or icon fallback), name, count. */}
                      <Link
                        href={`/menu?category=${c.slug}`}
                        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface-container-lowest transition-colors hover:border-cta"
                      >
                        <span className="relative block aspect-[4/3] overflow-hidden bg-surface-container-low">
                          {photo ? (
                            <Image
                              src={photo}
                              alt=""
                              fill
                              sizes="(min-width: 1024px) 220px, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw"
                              className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-105"
                            />
                          ) : (
                            <span className="flex size-full items-center justify-center text-primary">
                              <CategoryIcon iconKey={c.iconKey} className="size-9" />
                            </span>
                          )}
                        </span>
                        <span className="flex flex-col gap-0.5 px-space-md py-space-sm">
                          <span className="text-label-lg text-on-surface">{c.name}</span>
                          <span className="text-body-sm text-on-surface-variant">
                            {c.itemCount} {c.itemCount === 1 ? 'item' : 'items'}
                          </span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
            </ul>
          </Container>
        </section>
      )}

      {trending.items.length > 0 && (
        <section className="border-y border-border bg-surface-warm-cream py-space-2xl md:py-[4.5rem]">
          <Container>
            <SectionHeading
              eyebrow="Trending & best sellers"
              title="Popular Picks"
              description="Picked by our café team."
            />
            <ul className="grid grid-cols-2 gap-space-sm md:gap-space-md lg:grid-cols-4">
              {trending.items.map((item) => (
                <li key={item.id} className="flex">
                  <MenuCard item={item} variant="trending" />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}

      {(featuredCombo || cafe?.studentZoneText || studentOffers.length > 0) && (
        <section className="bg-surface py-space-2xl">
          <Container className="grid gap-space-lg lg:grid-cols-2">
            {featuredCombo && <FeaturedCombo offer={featuredCombo} />}
            {(cafe?.studentZoneText || studentOffers.length > 0) && (
              <StudentTeaser text={cafe?.studentZoneText ?? null} offers={studentOffers} />
            )}
          </Container>
        </section>
      )}

      {extras.reviews.length > 0 && (
        <section className="bg-surface-container-low py-space-2xl">
          <Container>
            <SectionHeading eyebrow="Guest feedback" title="What Café Guests Are Saying" />
            <ReviewList reviews={extras.reviews} />
          </Container>
        </section>
      )}

      {extras.gallery.length > 0 && (
        <section className="bg-surface py-space-2xl">
          <Container>
            <SectionHeading
              eyebrow="Gallery"
              title="A Look Around ZORKO"
              action={
                isLive('/gallery') ? (
                  <Link
                    href="/gallery"
                    className="inline-flex min-h-12 items-center gap-1 text-label-lg text-primary hover:underline"
                  >
                    View gallery <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                ) : undefined
              }
            />
            <ul className="grid grid-cols-2 gap-space-sm md:grid-cols-3">
              {extras.gallery.map((g) => (
                <li key={g.id} className="relative aspect-square overflow-hidden rounded-2xl">
                  <Image
                    src={g.url}
                    alt={g.altText}
                    fill
                    sizes="(min-width: 768px) 33vw, 50vw"
                    className="object-cover"
                  />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}

      {cafe && <VisitUs cafe={cafe} />}
    </>
  )
}

function Hero({
  cafe,
  itemCount,
  heroImage,
}: {
  cafe: CafeDto | null
  itemCount: number
  heroImage: { url: string; altText: string } | null
}) {
  const today = cafe ? todayHours(cafe) : null
  const qrLive = isLive('/qr')
  const tiles = [
    qrLive
      ? {
          icon: QrCode,
          title: 'QR Digital Menu',
          text: 'Scan to browse',
        }
      : {
          icon: Search,
          title: 'Digital Menu',
          text: 'Search & filter',
        },
    {
      icon: GraduationCap,
      title: 'Student Zone',
      text: 'Offers for students',
    },
    {
      icon: Zap,
      title: 'Live Availability',
      text: "See what's in stock",
    },
  ]
  return (
    <section className="relative overflow-hidden bg-surface pt-space-xl pb-space-2xl md:pt-space-2xl">
      {/* One faint peach glow behind the photo (ADR-060); no other decoration. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-full bg-[radial-gradient(closest-side,var(--color-brand-peach),transparent)] opacity-35 lg:w-1/2"
      />
      <Container className="relative grid items-center gap-space-xl lg:grid-cols-12 lg:gap-space-2xl">
        <div className="flex flex-col items-start gap-space-lg lg:col-span-7">
          {today && (
            <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-container-lowest px-space-md py-1.5 text-label-md text-on-surface-variant">
              <Clock aria-hidden="true" className="size-4 text-tertiary" />
              {today.label ? `Open today ${today.label}` : 'Closed today'}
              {!today.verified && ' (to be confirmed)'}
            </p>
          )}
          <div className="flex flex-col gap-space-md">
            <p className="flex items-center gap-2 text-label-md tracking-[0.14em] text-primary uppercase">
              <span aria-hidden="true" className="h-[3px] w-8 rounded-full bg-cta" />
              ZORKO Sangli
            </p>
            <h1 className="max-w-[16ch] text-display-hero-mobile text-on-surface md:text-display-hero">
              Hungry? Bite Into Joy at <span className="text-primary">ZORKO Sangli!</span>
            </h1>
            <p className="max-w-xl text-body-lg text-on-surface-variant">
              Browse the full menu, see what&apos;s available right now and check the latest offers
              and combos — all in one place.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-space-sm sm:gap-space-md">
            <LinkButton
              href="/menu"
              iconEnd={<UtensilsCrossed aria-hidden="true" className="size-[18px]" />}
            >
              View Menu
            </LinkButton>
            {isLive('/offers') && (
              <LinkButton
                href="/offers"
                variant="secondary"
                icon={<Tag aria-hidden="true" className="size-[18px]" />}
              >
                View Offers
              </LinkButton>
            )}
          </div>
          <ul className="grid w-full max-w-xl grid-cols-1 gap-space-sm sm:grid-cols-3">
            {tiles.map((t) => (
              <li
                key={t.title}
                className="flex items-center gap-space-sm rounded-xl border border-border bg-surface-container-lowest px-space-md py-space-sm"
              >
                <t.icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-label-md text-on-surface">{t.title}</span>
                  <span className="block truncate text-body-sm text-on-surface-variant">
                    {t.text}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative flex justify-center lg:col-span-5">
          <div className="relative aspect-[4/5] w-full max-w-[460px] overflow-hidden rounded-2xl bg-surface-container shadow-xl">
            {heroImage ? (
              <Image
                src={heroImage.url}
                alt={heroImage.altText}
                fill
                priority
                sizes="(min-width: 1024px) 460px, 90vw"
                className="object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary to-primary-container text-on-primary">
                <UtensilsCrossed aria-hidden="true" className="size-16" />
              </div>
            )}
          </div>
          {itemCount > 0 && (
            <p className="absolute -top-4 left-0 flex items-center gap-3 rounded-xl border border-border bg-surface-container-lowest py-space-sm pr-space-lg pl-space-sm shadow-lg sm:left-2">
              <span className="flex size-11 items-center justify-center rounded-lg bg-cta text-on-cta">
                <UtensilsCrossed aria-hidden="true" className="size-5" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-heading text-title-price leading-none font-extrabold">
                  {itemCount}
                </span>
                <span className="text-label-sm text-on-surface-variant uppercase">
                  items on the menu
                </span>
              </span>
            </p>
          )}
        </div>
      </Container>
    </section>
  )
}

function FactsStrip({
  cafe,
  minComboPaise,
}: {
  cafe: CafeDto | null
  minComboPaise: number | null
}) {
  const today = cafe ? todayHours(cafe) : null
  const facts = [
    cafe?.verified.address && { icon: MapPin, title: cafe.city, text: cafe.addressLine },
    isLive('/qr')
      ? { icon: QrCode, title: 'QR Digital Menu', text: 'Scan the code at your table' }
      : { icon: UtensilsCrossed, title: 'Digital Menu', text: 'Live availability' },
    minComboPaise !== null && {
      icon: Tag,
      title: 'Combos',
      text: `From ${formatRupees(minComboPaise)}`,
    },
    today && {
      icon: Clock,
      title: today.label ? 'Open today' : 'Closed today',
      text: `${today.label ?? ''}${today.verified ? '' : ' (to be confirmed)'}`.trim(),
    },
  ].filter(Boolean) as { icon: typeof Clock; title: string; text: string }[]
  return (
    // Black brand band with an orange rule, matching the header bar and footer (ADR-059).
    <section
      aria-label="At a glance"
      className="border-y-[3px] border-brand-orange bg-brand-ink py-space-lg text-white"
    >
      <Container>
        <ul className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((f) => (
            <li key={f.title} className="flex items-center gap-space-sm">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-orange text-brand-ink">
                <f.icon aria-hidden="true" className="size-5" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-label-lg">{f.title}</span>
                <span className="truncate text-body-sm text-brand-ink-soft">{f.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  )
}

function FeaturedCombo({ offer }: { offer: OfferDto }) {
  return (
    <article className="flex flex-col gap-space-md rounded-3xl bg-gradient-to-br from-primary via-culinary-orange-deep to-primary-container p-space-xl text-on-primary shadow-md">
      <p className="self-start rounded-full bg-on-primary/15 px-3 py-1 text-label-sm uppercase">
        Featured combo
      </p>
      <h2 className="text-[34px] leading-tight font-extrabold">{offer.title}</h2>
      <p className="text-body-md">{offer.description}</p>
      <p className="flex flex-wrap items-baseline gap-space-sm">
        {offer.priceLabel && (
          <span className="font-heading text-[34px] leading-none font-extrabold">
            {offer.priceLabel}
          </span>
        )}
        {offer.regularPriceLabel && offer.savingsPaise && (
          <>
            <span className="sr-only">Regular price</span>
            <s className="text-body-md">{offer.regularPriceLabel}</s>
            <span className="rounded-full bg-secondary-container px-2.5 py-0.5 text-label-sm text-on-secondary-container uppercase">
              Save {formatRupees(offer.savingsPaise)}
            </span>
          </>
        )}
      </p>
      <p data-volatile className="text-body-sm">
        Valid till {formatDateIST(offer.endsAt)}
      </p>
      {isLive('/offers') && (
        <LinkButton href={`/offers/${offer.slug}`} variant="inverse" className="self-start">
          View offer
        </LinkButton>
      )}
    </article>
  )
}

function StudentTeaser({ text, offers }: { text: string | null; offers: OfferDto[] }) {
  return (
    <article className="flex flex-col gap-space-md rounded-3xl bg-surface-container p-space-xl shadow-md">
      <p className="flex items-center gap-1 self-start rounded-full bg-secondary-fixed px-3 py-1 text-label-sm text-on-secondary-fixed uppercase">
        <GraduationCap aria-hidden="true" className="size-3.5" /> Student Zone
      </p>
      <h2 className="text-headline-lg-mobile md:text-headline-lg">Offers for Students</h2>
      {text && <p className="text-body-md text-on-surface-variant">{text}</p>}
      {offers.length > 0 && (
        <ul className="grid gap-space-sm sm:grid-cols-2">
          {offers.map((o) => (
            <li
              key={o.slug}
              className="flex flex-col rounded-xl bg-surface-container-lowest p-space-sm"
            >
              <span className="text-label-lg">{o.title}</span>
              {o.priceLabel && (
                <span className="font-heading text-headline-sm font-extrabold text-primary">
                  {o.priceLabel}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {isLive('/student-zone') && (
        <LinkButton href="/student-zone" className="self-start">
          Explore Student Zone
        </LinkButton>
      )}
    </article>
  )
}

function VisitUs({ cafe }: { cafe: CafeDto }) {
  const showMap = cafe.mapQuery !== null
  return (
    <section className="bg-surface py-space-2xl">
      <Container>
        <div
          className={`grid gap-space-lg rounded-3xl bg-surface-container-low p-space-lg md:p-space-xl ${showMap ? 'lg:grid-cols-2' : ''}`}
        >
          <div className="flex flex-col gap-space-md">
            <SectionHeading eyebrow="Find our café" title={`Visit ${cafe.name}`} className="mb-0" />
            <div className="flex flex-col gap-space-sm rounded-2xl bg-surface-container-lowest p-space-md shadow-sm">
              <p className="flex gap-2 text-body-md">
                <MapPin aria-hidden="true" className="size-5 shrink-0 text-primary" />
                {shortAddress(cafe)}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-space-md gap-y-1 text-body-sm">
                {cafe.hours.map((d) => (
                  <div key={d.dayOfWeek} className="contents">
                    <dt className="text-on-surface-variant">{DAY_NAMES[d.dayOfWeek]}</dt>
                    <dd>{hoursLabel(d) ?? 'Closed'}</dd>
                  </div>
                ))}
              </dl>
              {!cafe.verified.hours && (
                <p className="text-body-sm text-on-surface-variant">
                  Hours to be confirmed by the café.
                </p>
              )}
              {cafe.phone && (
                <a
                  href={`tel:${cafe.phone}`}
                  className="flex min-h-12 items-center gap-2 text-label-lg text-primary hover:underline"
                >
                  <Phone aria-hidden="true" className="size-4" /> {formatPhone(cafe.phone)}
                </a>
              )}
            </div>
            {(cafe.directionsUrl || cafe.whatsappUrl) && (
              <div className="flex flex-wrap gap-space-sm">
                {cafe.directionsUrl && (
                  <a
                    href={cafe.directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClasses({})}
                  >
                    <Navigation aria-hidden="true" className="size-4" /> Get directions
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
                {cafe.whatsappUrl && (
                  <a
                    href={cafe.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClasses({ variant: 'whatsapp' })}
                  >
                    <MessageCircle aria-hidden="true" className="size-4" /> Chat on WhatsApp
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
              </div>
            )}
          </div>
          {showMap && <MapEmbed query={cafe.mapQuery!} title={`Map of ${cafe.name}`} />}
        </div>
      </Container>
    </section>
  )
}
