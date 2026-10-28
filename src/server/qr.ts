import 'server-only'
import QRCode from 'qrcode'
import { publicEnv } from '@/lib/config/env'

/**
 * QR code for the digital menu (FR-018, ADR-018). It always encodes the configured public site
 * URL (`NEXT_PUBLIC_SITE_URL`, validated at startup: https and not localhost on Vercel
 * production), never the address of the current request. `src=qr` and the table cards'
 * `table=N` are informational only; they are not stored or tracked.
 */
export function qrTarget(siteUrl: string = publicEnv.siteUrl, table?: number): string {
  const url = new URL('/menu?src=qr', siteUrl)
  // Table cards (ADR-061): informational only, like `src`.
  if (table !== undefined) url.searchParams.set('table', String(table))
  return url.toString()
}

/** Problems that would make a printed QR code useless (shown on /admin/qr). */
export function qrWarnings(siteUrl: string = publicEnv.siteUrl): string[] {
  const url = new URL(siteUrl)
  const warnings: string[] = []
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname))
    warnings.push(
      'The site URL is localhost: phones cannot open it. Set NEXT_PUBLIC_SITE_URL to the public address before printing.',
    )
  else if (/^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(url.hostname))
    warnings.push(
      'The site URL is a local network address: it only works on the same Wi-Fi. Use it for testing only, never for printing.',
    )
  if (url.protocol !== 'https:')
    warnings.push('The site URL is not https. Production must use https.')
  return warnings
}

// Error correction "M" survives small smudges; margin 4 is the quiet zone the spec requires.
const OPTIONS = {
  errorCorrectionLevel: 'M',
  margin: 4,
  color: { dark: '#1a1a1a', light: '#ffffff' },
} as const

export async function qrSvg(target = qrTarget()): Promise<string> {
  return QRCode.toString(target, { ...OPTIONS, type: 'svg' })
}

export async function qrPng(target = qrTarget()): Promise<Buffer> {
  return QRCode.toBuffer(target, { ...OPTIONS, type: 'png', width: 1024 })
}
