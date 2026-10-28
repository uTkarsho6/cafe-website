import type { Metadata, Viewport } from 'next'
import { DM_Sans, Inter } from 'next/font/google'
import { publicEnv } from '@/lib/config/env'
import { ToastProvider } from '@/components/ui/toast'
import './globals.css'

// Self-hosted at build time by next/font (no runtime request to Google) — ADR-007.
// Inter for headings, DM Sans for body and interface (ADR-060; were Sora / Plus Jakarta Sans).
const inter = Inter({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: {
    default: 'ZORKO Sangli',
    template: '%s | ZORKO Sangli',
  },
  description: 'Digital menu, offers and café information for ZORKO Sangli.',
}

export const viewport: Viewport = {
  themeColor: '#111111',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} ${dmSans.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
