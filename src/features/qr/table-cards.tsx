import { Download } from 'lucide-react'
import Image from 'next/image'
import { buttonClasses } from '@/components/ui/button'
import { PrintButton } from './print-button'
import { TABLE_COUNT, TABLE_NUMBERS, tableQrSrc } from './tables'

/**
 * Table QR cards 1–20 (Round 2C, ADR-061): one tent card per table, each with its own PNG/SVG
 * download, and "Print all" for a sheet of cards with dashed cut lines (two per row on paper).
 * The codes come from /api/v1/qr, generated on the server from NEXT_PUBLIC_SITE_URL.
 */
export function TableCards({ target }: { target: string }) {
  return (
    <section aria-labelledby="table-cards" className="flex flex-col gap-space-md">
      <div className="flex flex-wrap items-end justify-between gap-space-md print:hidden">
        <div>
          <h2 id="table-cards" className="text-headline-md">
            Table cards
          </h2>
          <p className="max-w-prose text-body-md text-on-surface-variant">
            One card for each of the {TABLE_COUNT} tables. Every code opens the menu at{' '}
            <span className="font-bold break-all text-on-surface">{target}</span> with the table
            number added; the number is not stored and there is no table ordering.
          </p>
        </div>
        <PrintButton label={`Print all ${TABLE_COUNT} cards`} />
      </div>

      <ul className="grid gap-space-md sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-2 print:gap-0">
        {TABLE_NUMBERS.map((n) => (
          <li
            key={n}
            data-testid="table-card"
            className="flex break-inside-avoid flex-col gap-space-sm print:border print:border-dashed print:border-outline print:p-6"
          >
            <div className="flex flex-col items-center gap-space-sm rounded-2xl border border-border bg-white p-space-md text-center print:rounded-none print:border-0 print:p-0">
              <Image src="/logo.webp" alt="" width={600} height={229} className="h-10 w-auto" />
              <p className="font-heading text-headline-md text-on-surface">Table {n}</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- a generated SVG, no optimisation needed */}
              <img
                src={tableQrSrc(n, 'svg')}
                alt={`QR code for table ${n}: opens the ZORKO Sangli digital menu`}
                width={176}
                height={176}
                className="size-44"
              />
              <p className="text-label-md text-on-surface">Scan to see our menu</p>
              <p className="text-body-sm text-on-surface-variant">No app or sign-in needed</p>
            </div>
            <div className="flex gap-space-sm print:hidden">
              {(['png', 'svg'] as const).map((format) => (
                <a
                  key={format}
                  href={tableQrSrc(n, format, true)}
                  download
                  aria-label={`Download table ${n} QR code as ${format.toUpperCase()}`}
                  className={buttonClasses({
                    variant: 'secondary',
                    size: 'sm',
                    className: 'flex-1',
                  })}
                >
                  <Download aria-hidden="true" className="size-4" /> {format.toUpperCase()}
                </a>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
