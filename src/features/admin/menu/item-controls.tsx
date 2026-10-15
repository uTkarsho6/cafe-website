'use client'

import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import {
  deleteItemAction,
  setAvailabilityAction,
  setItemArchivedAction,
  type FormState,
} from '../menu-actions'

/** Runs a Server Action and reports the result as a toast. */
export function useActionToast() {
  const toast = useToast()
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<FormState>, onDone?: (r: FormState) => void) =>
    start(async () => {
      const result = await fn()
      if (result.message) toast.show(result.message, result.ok ? 'success' : 'error')
      onDone?.(result)
    })
  return { pending, run }
}

/** Availability switch in the item list (optimistic, reverts if the server refuses). */
export function AvailabilityToggle({
  itemId,
  name,
  available,
}: {
  itemId: string
  name: string
  available: boolean
}) {
  const [checked, setChecked] = useState(available)
  const { pending, run } = useActionToast()
  return (
    <Switch
      checked={checked}
      disabled={pending}
      label={`Available: ${name}`}
      onCheckedChange={(next) => {
        setChecked(next)
        run(
          () => setAvailabilityAction(itemId, next),
          (r) => !r.ok && setChecked(!next),
        )
      }}
    />
  )
}

/** Archive / restore / delete for one item, each behind a confirmation dialog. */
export function ItemDangerZone({
  itemId,
  name,
  isArchived,
  offerCount,
}: {
  itemId: string
  name: string
  isArchived: boolean
  offerCount: number
}) {
  const [confirm, setConfirm] = useState<'archive' | 'restore' | 'delete' | null>(null)
  const { pending, run } = useActionToast()
  const close = () => setConfirm(null)

  return (
    <div className="flex flex-wrap gap-space-sm">
      {isArchived ? (
        <>
          <Button
            variant="secondary"
            icon={<ArchiveRestore aria-hidden="true" className="size-4" />}
            onClick={() => setConfirm('restore')}
          >
            Restore item
          </Button>
          <Button
            variant="destructive"
            icon={<Trash2 aria-hidden="true" className="size-4" />}
            onClick={() => setConfirm('delete')}
            disabled={offerCount > 0}
            title={
              offerCount > 0 ? 'Used by an offer or combo: it can only stay archived' : undefined
            }
          >
            Delete permanently
          </Button>
        </>
      ) : (
        <Button
          variant="secondary"
          icon={<Archive aria-hidden="true" className="size-4" />}
          onClick={() => setConfirm('archive')}
        >
          Archive item
        </Button>
      )}

      <ConfirmDialog
        open={confirm === 'archive'}
        onCancel={close}
        title={`Archive "${name}"?`}
        description="It disappears from the public menu at once. You can restore it later."
        confirmLabel="Archive"
        pending={pending}
        onConfirm={() => run(() => setItemArchivedAction(itemId, true), close)}
      />
      <ConfirmDialog
        open={confirm === 'restore'}
        onCancel={close}
        title={`Restore "${name}"?`}
        description="It shows on the public menu again if it is published and its category is active."
        confirmLabel="Restore"
        pending={pending}
        onConfirm={() => run(() => setItemArchivedAction(itemId, false), close)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onCancel={close}
        title={`Delete "${name}" permanently?`}
        description="This removes the item, its images, add-ons and links. It cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        pending={pending}
        onConfirm={() => run(() => deleteItemAction(itemId), close)}
      />
    </div>
  )
}
