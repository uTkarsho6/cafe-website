import { TriangleAlert } from 'lucide-react'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { QrCard } from '@/features/qr/qr-card'
import { PrintButton } from '@/features/qr/print-button'
import { requireAdmin } from '@/server/auth/admin'
import { qrTarget, qrWarnings } from '@/server/qr'

export const metadata: Metadata = { title: 'QR codes' }

/**
 * Admin QR (FR-049): the one menu code (the same as /qr) and the warnings that matter before
 * printing. The per-table cards were removed (ADR-078): one code is enough. When printing, only
 * the code is kept.
 */
export default function AdminQrPage() {
  return (
    <div className="flex flex-col gap-space-xl">
      <header className="print:hidden">
        <h1 className="text-headline-lg-mobile md:text-headline-lg">QR codes</h1>
        <p className="text-body-md text-on-surface-variant">
          One code for the whole café. Print it for the counter and the tables; it opens the
          public digital menu.
        </p>
      </header>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <AdminQr />
      </Suspense>
    </div>
  )
}

async function AdminQr() {
  await connection()
  await requireAdmin('/admin/qr')
  const warnings = qrWarnings()
  return (
    <>
      {warnings.length > 0 && (
        <div
          role="alert"
          className="flex max-w-3xl gap-space-sm rounded-2xl bg-error-container p-space-md text-body-sm text-on-error-container print:hidden"
        >
          <TriangleAlert aria-hidden="true" className="size-5 shrink-0" />
          <ul className="flex flex-col gap-1">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex max-w-3xl flex-col gap-space-md">
        <QrCard target={qrTarget()} />
        <div className="flex flex-col items-center gap-space-sm print:hidden">
          <PrintButton label="Print QR code" />
          <p className="text-center text-body-sm text-on-surface-variant">
            The address comes from NEXT_PUBLIC_SITE_URL. To change it, update that setting and
            redeploy (DEPLOYMENT.md). Test the printed code with two different phones before using
            it.
          </p>
        </div>
      </div>
    </>
  )
}
