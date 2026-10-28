import { LogOut } from 'lucide-react'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { AdminNav } from '@/components/layout/admin-nav'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { logoutAction } from '@/features/admin/actions'
import { liveAdminNav } from '@/lib/site/admin-nav'
import { NO_INDEX } from '@/lib/site/seo'
import { requireAdmin, type AdminIdentity } from '@/server/auth/admin'

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s | ZORKO Admin' },
  robots: NO_INDEX,
}

/**
 * Admin shell (UI_SPEC §8.4). The whole shell renders only after `requireAdmin()` succeeds.
 * Pages call `requireAdmin()` again themselves: layouts are not re-run on client navigation,
 * so a layout check alone is not enough.
 */
export default function AdminShellLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  )
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  await connection()
  const admin = await requireAdmin()
  return (
    <div className="flex min-h-dvh flex-col bg-surface lg:flex-row print:bg-white">
      {/* Printing (table QR cards, ADR-061) keeps only the page content. */}
      <div className="contents print:hidden">
        <AdminNav items={liveAdminNav()} footer={<AccountBox admin={admin} />} />
      </div>
      <main id="main" className="min-w-0 flex-1 p-space-md md:p-space-xl print:p-0">
        {children}
      </main>
    </div>
  )
}

function AccountBox({ admin }: { admin: AdminIdentity }) {
  return (
    <div className="flex flex-col gap-space-sm border-t border-surface-container pt-space-md">
      <p className="truncate px-space-md text-body-sm text-on-surface-variant">
        Signed in as{' '}
        <span className="font-bold text-on-surface">{admin.displayName ?? admin.email}</span>
      </p>
      <form action={logoutAction}>
        <Button type="submit" variant="secondary" size="sm" className="w-full">
          <LogOut aria-hidden="true" className="size-4" /> Log out
        </Button>
      </form>
    </div>
  )
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh" aria-busy="true">
      <span className="sr-only" role="status">
        Checking your session…
      </span>
      <Skeleton className="hidden h-dvh w-64 rounded-none lg:block" />
      <div className="flex-1 p-space-xl">
        <Skeleton className="h-10 w-48" />
      </div>
    </div>
  )
}
