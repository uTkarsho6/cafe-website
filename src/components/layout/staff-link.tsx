import { Lock } from 'lucide-react'
import Link from 'next/link'

/**
 * "Staff portal" entry in the phone "More" sheet and the tablet drawer (ADR-055). It only opens
 * the sign-in page; who may enter the admin is decided on the server (requireAdmin).
 */
export function StaffLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/admin/login"
      onClick={onNavigate}
      className="mt-space-sm flex min-h-12 items-center gap-2 rounded-xl border-t border-surface-container-high px-space-md text-label-md text-on-surface-variant hover:bg-surface-container"
    >
      <Lock aria-hidden="true" className="size-4" />
      Staff portal
    </Link>
  )
}
