/**
 * Security response headers (SECURITY.md §10, DECISIONS ADR-016).
 *
 * CSP follows the Next.js 16 "Without Nonces" guide: nonces would force every page to render
 * dynamically, which conflicts with cached public pages. `'unsafe-inline'` for scripts is an
 * accepted residual risk (R-07). Phase 7 tested experimental SRI with `script-src 'self'`: Next
 * still streams page data through inline scripts, which that policy blocks (24 violations on
 * the home page, no hydration), so it was not adopted (ADR-053).
 */

type HeaderOptions = {
  isDev: boolean
  /**
   * True when the site is served over https (from NEXT_PUBLIC_SITE_URL). HSTS and
   * upgrade-insecure-requests are sent only then: Safari applies them even to http://localhost,
   * which breaks every asset request on a local production build.
   */
  isHttps: boolean
  /** Supabase project origin (Phase 3+), allowed for images and API calls. */
  supabaseOrigin?: string
}

export function buildContentSecurityPolicy({
  isDev,
  isHttps,
  supabaseOrigin,
}: HeaderOptions): string {
  const extra = supabaseOrigin ? ` ${supabaseOrigin}` : ''
  const directives = [
    "default-src 'self'",
    // 'unsafe-eval' only in development (React dev tooling / Fast Refresh).
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${extra}`,
    "font-src 'self'",
    `connect-src 'self'${extra}${isDev ? ' ws:' : ''}`,
    // Google Maps embed on the contact page (ADR-017).
    'frame-src https://www.google.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
  if (isHttps) directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

export function buildSecurityHeaders(options: HeaderOptions): { key: string; value: string }[] {
  const headers = [
    { key: 'Content-Security-Policy', value: buildContentSecurityPolicy(options) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ]
  if (options.isHttps) {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' })
  }
  return headers
}
