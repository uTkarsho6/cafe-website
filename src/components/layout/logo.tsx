import Image from 'next/image'
import Link from 'next/link'

/**
 * Official ZORKO logo with the "Sangli" outlet tag (UI_SPEC §8.1, ADR-055). The logo file is the
 * brand asset supplied by the team (source kept in design/brand/). The link's aria-label names the
 * destination, so the image itself is decorative.
 */
export function Logo() {
  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-space-sm rounded-xl"
      aria-label="ZORKO Sangli — home"
    >
      <Image
        src="/logo.webp"
        alt=""
        width={246}
        height={105}
        priority
        className="h-10 w-auto md:h-12"
      />
      <span aria-hidden="true" className="text-label-sm tracking-widest text-primary uppercase">
        Sangli
      </span>
    </Link>
  )
}
