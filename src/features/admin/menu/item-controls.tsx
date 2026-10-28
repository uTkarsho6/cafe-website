'use client'

import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Check, Plus, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  ITEM_FLAG_LABELS,
  ITEM_FLAGS,
  paiseToRupeesInput,
  type ItemFlag,
} from '@/lib/validation/admin-menu'
import {
  deleteItemAction,
  setAvailabilityAction,
  setItemArchivedAction,
  setItemFlagAction,
  setPriceAction,
  type FormState,
} from '../menu-actions'

/** Runs a Server Action and reports the result as a toast. */
export function useActionToast() {
  const toast = useToast()
  const router = useRouter()
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<FormState>, onDone?: (r: FormState) => void) =>
    start(async () => {
      const result = await fn()
      if (result.message && !result.redirectTo)
        toast.show(result.message, result.ok ? 'success' : 'error')
      onDone?.(result)
      if (result.redirectTo) router.push(result.redirectTo)
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

/**
 * Inline ₹ price in the item list (Round 2C). Saves on Enter or when focus leaves the field;
 * Escape restores the last saved price. The server validates again and has the final say.
 */
export function PriceEditor({
  itemId,
  name,
  pricePaise,
}: {
  itemId: string
  name: string
  pricePaise: number
}) {
  const [saved, setSaved] = useState(() => paiseToRupeesInput(pricePaise))
  const [value, setValue] = useState(saved)
  const [error, setError] = useState<string | null>(null)
  const { pending, run } = useActionToast()
  const errorId = `price-error-${itemId}`

  const save = () => {
    const next = value.trim()
    if (next === saved) return setError(null)
    run(
      () => setPriceAction(itemId, next),
      (r) => {
        setError(r.ok ? null : r.message)
        if (r.ok) setSaved(next)
      },
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="relative w-28">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-heading text-on-surface-variant"
        >
          ₹
        </span>
        <input
          type="text"
          inputMode="decimal"
          maxLength={9}
          aria-label={`Price of ${name} in rupees`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              setValue(saved)
              setError(null)
            }
          }}
          className="h-12 w-full rounded-xl border border-border bg-surface-container-lowest pr-2 pl-7 font-heading text-body-md text-on-surface transition focus:border-cta focus:outline-none focus-visible:ring-[1.5px] focus-visible:ring-primary disabled:opacity-60 aria-invalid:border-error"
        />
      </div>
      {error && (
        <p id={errorId} className="max-w-40 text-body-sm text-error">
          {error}
        </p>
      )}
    </div>
  )
}

/** One-click Best seller / Trending / Featured labels (Round 2C); optimistic, reverts on error. */
export function FlagToggles({
  itemId,
  name,
  flags,
}: {
  itemId: string
  name: string
  flags: Record<ItemFlag, boolean>
}) {
  const [state, setState] = useState(flags)
  const { pending, run } = useActionToast()
  const set = (flag: ItemFlag, on: boolean) => setState((s) => ({ ...s, [flag]: on }))

  return (
    <div role="group" aria-label={`Labels for ${name}`} className="flex flex-wrap">
      {ITEM_FLAGS.map((flag) => {
        const on = state[flag]
        const Icon = on ? Check : Plus
        return (
          <button
            key={flag}
            type="button"
            aria-pressed={on}
            disabled={pending}
            onClick={() => {
              set(flag, !on)
              run(
                () => setItemFlagAction(itemId, flag, !on),
                (r) => !r.ok && set(flag, on),
              )
            }}
            className="group inline-flex min-h-12 items-center px-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-label-sm whitespace-nowrap transition-colors',
                on
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border bg-surface-container-lowest text-on-surface-variant group-hover:border-primary/40 group-hover:text-on-surface',
              )}
            >
              <Icon aria-hidden="true" className="size-3.5" />
              {ITEM_FLAG_LABELS[flag]}
            </span>
          </button>
        )
      })}
    </div>
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
