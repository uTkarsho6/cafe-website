/**
 * Admin sidebar (UI_SPEC §8.4). Like the public nav (ADR-042), a module is listed only once it
 * exists, so the admin never sees dead links. Phases 5B/5C/6 switch modules on here.
 */
import type { NavItem } from './nav'

export const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', live: true },
  { href: '/admin/menu', label: 'Menu items', live: true }, // 5B
  { href: '/admin/categories', label: 'Categories', live: true }, // 5B
  { href: '/admin/offers', label: 'Offers & combos', live: true }, // 5C
  { href: '/admin/banners', label: 'Banners', live: true }, // 5C
  { href: '/admin/cafe', label: 'Café info', live: true }, // 5C
  { href: '/admin/gallery', label: 'Gallery', live: true }, // 5C
  { href: '/admin/feedback', label: 'Feedback', live: true }, // 6
  { href: '/admin/qr', label: 'QR code', live: true }, // 6
]

export const liveAdminNav = () => ADMIN_NAV.filter((i) => i.live)

/** Exact match for the dashboard, prefix match for modules (e.g. /admin/menu/123). */
export function isActiveAdminPath(pathname: string, href: string): boolean {
  return href === '/admin'
    ? pathname === '/admin'
    : pathname === href || pathname.startsWith(`${href}/`)
}
