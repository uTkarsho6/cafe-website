import Image from 'next/image'
import Link from 'next/link'

/**
 * Official ZORKO logo with the "Sangli" outlet tag (UI_SPEC §8.1, ADR-055). The logo file is the
 * brand asset supplied by the team (source kept in design/brand/). The link's aria-label names the
 * destination, so the image itself is decorative. `tone="dark"` for the black header (ADR-059).
 */
export function Logo({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-space-sm rounded-xl"
      aria-label="ZORKO Sangli — home"
    >
      <Image
        src="/logo.webp"
        alt=""
        width={600}
        height={229}
        priority
        className="h-10 w-auto md:h-12"
      />
      <span
        aria-hidden="true"
        // On the black header the caption uses brand orange (6.97:1); primary is only 3.14:1 there.
        className={`text-label-sm tracking-widest uppercase ${tone === 'dark' ? 'text-brand-orange' : 'text-primary'}`}
      >
        Sangli
      </span>
    </Link>
  )
}
