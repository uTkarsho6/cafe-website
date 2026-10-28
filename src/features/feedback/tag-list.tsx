import { FEEDBACK_TAGS, type FeedbackTagKey } from '@/lib/validation/feedback'
import { cn } from '@/lib/utils'

/** Quick highlights the guest ticked (ADR-062), shown read-only in moderation and on reviews. */
export function FeedbackTagList({
  tags,
  className,
}: {
  tags: readonly FeedbackTagKey[]
  className?: string
}) {
  if (tags.length === 0) return null
  return (
    <ul aria-label="Highlights" className={cn('flex flex-wrap gap-1.5', className)}>
      {tags.map((t) => (
        <li
          key={t}
          className="rounded-full bg-surface-warm-cream px-2.5 py-0.5 text-label-md text-primary"
        >
          {FEEDBACK_TAGS[t]}
        </li>
      ))}
    </ul>
  )
}
