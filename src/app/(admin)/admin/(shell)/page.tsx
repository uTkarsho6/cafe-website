import type { Metadata } from 'next'
import { connection } from 'next/server'
import { formatDateIST } from '@/lib/format'
import { requireAdmin } from '@/server/auth/admin'
import { getDashboardStats, listRecentAudit } from '@/server/services/dashboard'

export const metadata: Metadata = { title: 'Dashboard' }

const ACTION_LABEL: Record<string, string> = {
  LOGIN: 'Signed in',
  LOGIN_REFUSED: 'Sign-in refused',
  LOGOUT: 'Signed out',
  ADMIN_ALLOWLISTED: 'Admin added',
  CREATE: 'Created',
  UPDATE: 'Updated',
  AVAILABILITY: 'Availability',
  ARCHIVE: 'Archived',
  RESTORE: 'Restored',
  DELETE: 'Deleted',
  IMAGE_UPLOAD: 'Image uploaded',
  IMAGE_REMOVE: 'Image removed',
}

/** Dashboard (UI_SPEC §13): real counts from the database and the latest audit entries. */
export default async function AdminDashboardPage() {
  await connection()
  const admin = await requireAdmin('/admin')
  const [stats, audit] = await Promise.all([getDashboardStats(), listRecentAudit(10)])
  const cards = [
    { label: 'Menu items', value: stats.totalItems },
    { label: 'Available', value: stats.availableItems },
    { label: 'Out of stock', value: stats.unavailableItems },
    { label: 'Active offers', value: stats.activeOffers },
    { label: 'Scheduled offers', value: stats.scheduledOffers },
    { label: 'Pending feedback', value: stats.pendingFeedback },
    { label: 'Gallery photos', value: stats.publishedPhotos },
  ]

  return (
    <div className="flex flex-col gap-space-xl">
      <header>
        <h1 className="text-headline-lg-mobile md:text-headline-lg">Dashboard</h1>
        <p className="text-body-md text-on-surface-variant">
          Welcome, {admin.displayName ?? admin.email}. These numbers come straight from the
          database.
        </p>
      </header>

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Summary
        </h2>
        <dl className="grid gap-space-md sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c) => (
            <div
              key={c.label}
              data-testid="stat-card"
              className="flex flex-col gap-1 rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"
            >
              <dt className="text-label-md text-on-surface-variant">{c.label}</dt>
              <dd className="font-heading text-headline-lg">{c.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="audit-heading" className="flex flex-col gap-space-md">
        <h2 id="audit-heading" className="text-headline-sm">
          Recent activity
        </h2>
        {audit.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No admin activity recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-surface-container-lowest shadow-sm">
            <table className="w-full min-w-[32rem] text-left text-body-sm">
              <caption className="sr-only">Latest 10 admin actions</caption>
              <thead className="text-label-md text-on-surface-variant">
                <tr className="border-b border-surface-container">
                  <th scope="col" className="px-space-md py-space-sm">
                    When
                  </th>
                  <th scope="col" className="px-space-md py-space-sm">
                    Who
                  </th>
                  <th scope="col" className="px-space-md py-space-sm">
                    Action
                  </th>
                  <th scope="col" className="px-space-md py-space-sm">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-b border-surface-container last:border-0">
                    <td className="px-space-md py-space-sm whitespace-nowrap">
                      {formatDateIST(a.createdAt)}{' '}
                      {new Intl.DateTimeFormat('en-IN', {
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: 'Asia/Kolkata',
                      }).format(new Date(a.createdAt))}
                    </td>
                    <td className="px-space-md py-space-sm">{a.adminName ?? '—'}</td>
                    <td className="px-space-md py-space-sm">
                      {ACTION_LABEL[a.action] ?? a.action}
                    </td>
                    <td className="px-space-md py-space-sm text-on-surface-variant">{a.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
