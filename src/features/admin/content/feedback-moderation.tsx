'use client'

import { Check, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { deleteFeedbackAction, moderateFeedbackAction } from '../feedback-actions'
import { useActionToast } from '../menu/item-controls'

export type FeedbackRow = {
  id: string
  displayName: string | null
  message: string
  status: string
  isDemo: boolean
  createdAt: string
  moderatedAt: string | null
  moderatedBy: string | null
}

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso))

/**
 * Moderation list (UI_SPEC §13 feedback). Guest text is rendered by React as plain text, so HTML
 * or script in a message is shown, never run.
 */
export function FeedbackModeration({ items }: { items: FeedbackRow[] }) {
  const [remove, setRemove] = useState<FeedbackRow | null>(null)
  const { pending, run } = useActionToast()

  return (
    <>
      <ul className="flex flex-col gap-space-md">
        {items.map((f) => (
          <li
            key={f.id}
            data-testid="feedback-row"
            className="flex flex-col gap-space-sm rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-space-sm text-body-sm text-on-surface-variant">
              <span className="font-bold text-on-surface">{f.displayName ?? 'Guest'}</span>
              <span data-volatile>{when(f.createdAt)}</span>
              {f.isDemo && <Badge tone="demo">Demo</Badge>}
              {f.moderatedBy && f.moderatedAt && (
                <span data-volatile>
                  · {f.status === 'APPROVED' ? 'approved' : 'rejected'} by {f.moderatedBy}
                </span>
              )}
            </div>
            <p className="text-body-md break-words whitespace-pre-line">{f.message}</p>
            <div className="flex flex-wrap gap-space-sm">
              {f.status !== 'APPROVED' && (
                <Button
                  size="sm"
                  disabled={pending}
                  icon={<Check aria-hidden="true" className="size-4" />}
                  onClick={() => run(() => moderateFeedbackAction(f.id, 'APPROVED'))}
                  aria-label={`Approve feedback from ${f.displayName ?? 'Guest'}`}
                >
                  Approve
                </Button>
              )}
              {f.status !== 'REJECTED' && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  icon={<X aria-hidden="true" className="size-4" />}
                  onClick={() => run(() => moderateFeedbackAction(f.id, 'REJECTED'))}
                  aria-label={`Reject feedback from ${f.displayName ?? 'Guest'}`}
                >
                  Reject
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                icon={<Trash2 aria-hidden="true" className="size-4" />}
                onClick={() => setRemove(f)}
                aria-label={`Delete feedback from ${f.displayName ?? 'Guest'}`}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={remove !== null}
        onCancel={() => setRemove(null)}
        title="Delete this feedback?"
        description="It is removed permanently. This cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        pending={pending}
        onConfirm={() =>
          run(
            () => deleteFeedbackAction(remove!.id),
            () => setRemove(null),
          )
        }
      />
    </>
  )
}
