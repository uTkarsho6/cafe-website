import { FeedbackTagList } from '@/features/feedback/tag-list'
import type { ReviewDto } from '@/server/services/home'

/** Approved guest feedback only (FR-020): unapproved feedback never reaches this component. */
export function ReviewList({ reviews }: { reviews: ReviewDto[] }) {
  return (
    <ul className="grid gap-space-md md:grid-cols-3">
      {reviews.map((r) => (
        <li
          key={r.id}
          className="flex flex-col gap-space-sm rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"
        >
          <blockquote className="text-body-md italic">“{r.message}”</blockquote>
          <FeedbackTagList tags={r.tags} />
          <p className="mt-auto flex items-center gap-space-sm">
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-full bg-primary-fixed text-label-md text-on-primary-fixed"
            >
              {r.displayName.slice(0, 2).toUpperCase()}
            </span>
            <span className="flex flex-col">
              <span className="text-[15px] font-bold">{r.displayName}</span>
              <span className="text-body-sm text-on-surface-variant">
                {new Intl.DateTimeFormat('en-IN', {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'Asia/Kolkata',
                }).format(new Date(r.createdAt))}
              </span>
            </span>
          </p>
        </li>
      ))}
    </ul>
  )
}
