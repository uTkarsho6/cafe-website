import { Download, UtensilsCrossed } from 'lucide-react'
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'

/**
 * QR card (UI_SPEC §12.10): the code, its destination as text, downloads and an "Open the menu"
 * link. The image is served by /api/v1/qr (generated on the server from NEXT_PUBLIC_SITE_URL).
 */
export function QrCard({ target }: { target: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-space-md rounded-3xl bg-surface-container-lowest p-space-lg text-center shadow-sm md:p-space-xl">
      {/* eslint-disable-next-line @next/next/no-img-element -- a generated SVG, no optimisation needed */}
      <img
        src="/api/v1/qr?format=svg"
        alt={`QR code that opens the ZORKO Sangli digital menu (${target})`}
        width={280}
        height={280}
        className="size-[280px] rounded-xl bg-white"
        data-testid="qr-image"
      />
      <p className="text-body-sm text-on-surface-variant">
        Opens: <span className="font-bold break-all text-on-surface">{target}</span>
      </p>
      <div className="flex flex-wrap justify-center gap-space-sm">
        <a
          href="/api/v1/qr?format=png&download=1"
          download
          className={buttonClasses({ variant: 'secondary' })}
        >
          <Download aria-hidden="true" className="size-4" /> Download PNG
        </a>
        <a
          href="/api/v1/qr?format=svg&download=1"
          download
          className={buttonClasses({ variant: 'secondary' })}
        >
          <Download aria-hidden="true" className="size-4" /> Download SVG
        </a>
      </div>
      <Link href="/menu" className={buttonClasses({})}>
        <UtensilsCrossed aria-hidden="true" className="size-4" /> Open the menu
      </Link>
    </div>
  )
}
