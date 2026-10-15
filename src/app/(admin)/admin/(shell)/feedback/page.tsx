import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { PillLink, PillRow } from '@/components/ui/chip'
import { Pagination } from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/states'
import { FeedbackModeration } from '@/features/admin/content/feedback-moderation'
import { adminFeedbackQuerySchema } from '@/lib/validation/feedback'
import { requireAdmin } from '@/server/auth/admin'
import { listAdminFeedback, purgeOldRejectedFeedback } from '@/server/services/feedback'

export const metadata: Metadata = { title: 'Feedback' }

const TABS = [
  ['pending', 'Pending', 'PENDING'],
  ['approved', 'Approved', 'APPROVED'],
  ['rejected', 'Rejected', 'REJECTED'],
] as const

export default function AdminFeedbackPage({ searchParams }: PageProps<'/admin/feedback'>) {
  return (
    <div className="flex max-w-4xl flex-col gap-space-xl">
      <header>
        <h1 className="text-headline-lg-mobile md:text-headline-lg">Feedback</h1>
        <p className="text-body-md text-on-surface-variant">
          Only approved feedback is shown on the home and contact pages. Rejected feedback is
          deleted automatically after 90 days.
        </p>
      </header>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <FeedbackList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function FeedbackList({ searchParams }: Pick<PageProps<'/admin/feedback'>, 'searchParams'>) {
  await connection()
  await requireAdmin('/admin/feedback')
  const raw = await searchParams
  const query = adminFeedbackQuerySchema.parse({ status: raw.status, page: raw.page })
  const tab = TABS.find(([key]) => key === query.status)!
  await purgeOldRejectedFeedback()
  const data = await listAdminFeedback(tab[2], query.page)

  return (
    <>
      <nav aria-label="Feedback status">
        <PillRow>
          {TABS.map(([key, label, status]) => (
            <PillLink
              key={key}
              href={key === 'pending' ? '/admin/feedback' : `/admin/feedback?status=${key}`}
              active={key === query.status}
            >
              {label} ({data.counts[status] ?? 0})
            </PillLink>
          ))}
        </PillRow>
      </nav>
      {data.items.length === 0 ? (
        <EmptyState
          title={`No ${tab[1].toLowerCase()} feedback`}
          description={
            query.status === 'pending' ? 'New feedback from the site appears here.' : undefined
          }
        />
      ) : (
        <FeedbackModeration items={data.items} />
      )}
      <Pagination
        page={query.page}
        totalPages={data.totalPages}
        basePath="/admin/feedback"
        query={{ status: query.status === 'pending' ? undefined : query.status }}
      />
    </>
  )
}
