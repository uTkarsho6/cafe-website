import type { Metadata } from 'next'
import { Container } from '@/components/ui/container'
import { QrCard } from '@/features/qr/qr-card'
import { pageMetadata } from '@/lib/site/seo'
import { qrTarget } from '@/server/qr'

export const metadata: Metadata = pageMetadata({
  title: 'QR Menu',
  description: 'Scan to open the ZORKO Sangli digital menu on your phone. No app or login needed.',
  path: '/qr',
})

/** QR menu (UI_SPEC §12.10, derived screen; FR-018). */
export default function QrPage() {
  return (
    <main id="main" className="flex-1">
      <div className="bg-surface-warm-cream">
        <Container className="flex flex-col gap-1 py-space-lg">
          <h1 className="text-headline-lg-mobile md:text-headline-lg">QR Menu</h1>
          <p className="text-body-md text-on-surface-variant">
            Scan with your phone camera to open the menu. No app or login needed.
          </p>
        </Container>
      </div>
      <Container className="py-space-xl">
        <QrCard target={qrTarget()} />
      </Container>
    </main>
  )
}
