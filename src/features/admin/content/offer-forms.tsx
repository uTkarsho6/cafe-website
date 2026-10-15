'use client'

import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Checkbox, Select, TextArea, TextField } from '@/components/ui/field'
import { formatRupees } from '@/lib/format'
import { paiseToRupeesInput } from '@/lib/validation/admin-menu'
import { deleteOfferAction, saveOfferAction, setOfferExpiredAction } from '../content-actions'
import type { FormState } from '../menu-actions'
import { useActionToast } from '../menu/item-controls'
import { keepValues, useFormToast } from '../menu/item-form'
import { FormError, ImageInput, UploadsOff } from './form-bits'

export type OfferFormValues = {
  id?: string
  kind: string
  title: string
  description: string
  promoPricePaise: number | null
  startsAt: string // datetime-local value, India time
  endsAt: string
  isPublished: boolean
  isStudentOffer: boolean
  isFeatured: boolean
  sortOrder: number
  items: { menuItemId: string; quantity: number }[]
  imageUrl: string | null
}

export type OfferItemOption = {
  id: string
  name: string
  pricePaise: number
  category: { name: string }
}

const initial: FormState = { ok: false, message: null, errors: {} }

/** Create / edit an offer or combo (UI_SPEC §13 offer management). */
export function OfferForm({
  values,
  itemOptions,
  uploadsEnabled,
}: {
  values: OfferFormValues
  itemOptions: OfferItemOption[]
  uploadsEnabled: boolean
}) {
  const [state, action, pending] = useActionState(saveOfferAction, initial)
  useFormToast(state)
  const [kind, setKind] = useState(values.kind)
  const qty = new Map(values.items.map((i) => [i.menuItemId, i.quantity]))
  const e = state.errors

  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-space-md" noValidate>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="grid gap-space-md md:grid-cols-2">
        <Select
          label="Type"
          name="kind"
          required
          value={kind}
          onChange={(ev) => setKind(ev.target.value)}
          error={e.kind}
        >
          <option value="COMBO">Combo (items at one price)</option>
          <option value="DISCOUNT">Discount (special price)</option>
          <option value="INFO">Information only (no price)</option>
        </Select>
        <TextField
          label="Offer price (₹)"
          name="promoPrice"
          inputMode="decimal"
          required={kind !== 'INFO'}
          disabled={kind === 'INFO'}
          defaultValue={
            values.promoPricePaise === null ? '' : paiseToRupeesInput(values.promoPricePaise)
          }
          hint={kind === 'INFO' ? 'Information offers have no price' : 'Rupees, e.g. 199'}
          error={e.promoPrice}
        />
      </div>
      <TextField
        label="Title"
        name="title"
        required
        maxLength={80}
        defaultValue={values.title}
        error={e.title}
      />
      <TextArea
        label="Description"
        name="description"
        required
        maxLength={600}
        defaultValue={values.description}
        error={e.description}
      />
      <div className="grid gap-space-md md:grid-cols-2">
        <TextField
          label="Starts (India time)"
          name="startsAt"
          type="datetime-local"
          required
          defaultValue={values.startsAt}
          error={e.startsAt}
        />
        <TextField
          label="Ends (India time)"
          name="endsAt"
          type="datetime-local"
          required
          defaultValue={values.endsAt}
          hint="The offer disappears from the site at this moment"
          error={e.endsAt}
        />
      </div>
      <fieldset className="grid gap-x-space-lg md:grid-cols-2">
        <legend className="mb-space-sm text-label-md">Visibility</legend>
        <Checkbox
          name="isPublished"
          label="Published"
          description="Off = draft, never shown publicly"
          defaultChecked={values.isPublished}
        />
        <Checkbox
          name="isFeatured"
          label="Featured on the home page"
          defaultChecked={values.isFeatured}
        />
        <Checkbox
          name="isStudentOffer"
          label="Student Zone offer"
          description="Shown in the Student Zone (no student-ID check exists)"
          defaultChecked={values.isStudentOffer}
        />
        <TextField
          label="Sort order"
          name="sortOrder"
          type="number"
          min={0}
          max={9999}
          defaultValue={values.sortOrder}
          error={e.sortOrder}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-space-sm">
        <legend className="mb-space-sm text-label-md">
          Included menu items {kind === 'COMBO' ? '(at least one)' : '(optional)'}
        </legend>
        <p className="text-body-sm text-on-surface-variant">
          Set a quantity for each item in the offer; 0 = not included (max 10 items).
        </p>
        {e.items && <p className="text-body-sm text-error">{e.items}</p>}
        <div className="max-h-80 overflow-y-auto rounded-2xl border border-surface-container p-space-sm">
          <ul className="flex flex-col">
            {itemOptions.map((o) => (
              <li
                key={o.id}
                className="flex min-h-12 items-center justify-between gap-space-md px-1"
              >
                <label htmlFor={`qty-${o.id}`} className="text-body-md">
                  {o.name}{' '}
                  <span className="text-body-sm text-on-surface-variant">
                    · {o.category.name} · {formatRupees(o.pricePaise)}
                  </span>
                </label>
                <input
                  id={`qty-${o.id}`}
                  name={`qty_${o.id}`}
                  type="number"
                  min={0}
                  max={20}
                  defaultValue={qty.get(o.id) ?? 0}
                  className="h-12 w-20 rounded-xl border border-[rgba(26,26,26,0.12)] bg-surface-canvas-subtle px-space-sm text-body-md"
                />
              </li>
            ))}
          </ul>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-space-sm">
        <legend className="mb-space-sm text-label-md">Image (optional)</legend>
        {values.imageUrl ? (
          <div className="flex flex-wrap items-center gap-space-md">
            <div className="relative h-24 w-32 overflow-hidden rounded-xl bg-surface-container">
              <Image
                src={values.imageUrl}
                alt="Current offer image"
                fill
                sizes="128px"
                className="object-cover"
              />
            </div>
            <Checkbox name="removeImage" label="Remove the current image" />
          </div>
        ) : (
          <p className="text-body-sm text-on-surface-variant">
            No image: the site uses the first included dish&apos;s photo.
          </p>
        )}
        {uploadsEnabled ? (
          <ImageInput id="offer-image" label={values.imageUrl ? 'Replace image' : 'Upload image'} />
        ) : (
          <UploadsOff />
        )}
      </fieldset>

      <FormError state={state} />
      <div>
        <Button type="submit" loading={pending}>
          {values.id ? 'Save offer' : 'Create offer'}
        </Button>
      </div>
    </form>
  )
}

/** Expire now / reactivate / delete, each behind a confirmation dialog. */
export function OfferDangerZone({
  offerId,
  title,
  isExpired,
}: {
  offerId: string
  title: string
  isExpired: boolean
}) {
  const [confirm, setConfirm] = useState<'expire' | 'reactivate' | 'delete' | null>(null)
  const { pending, run } = useActionToast()
  const close = () => setConfirm(null)
  return (
    <div className="flex flex-wrap gap-space-sm">
      {isExpired ? (
        <Button
          variant="secondary"
          icon={<ArchiveRestore aria-hidden="true" className="size-4" />}
          onClick={() => setConfirm('reactivate')}
        >
          Reactivate
        </Button>
      ) : (
        <Button
          variant="secondary"
          icon={<Archive aria-hidden="true" className="size-4" />}
          onClick={() => setConfirm('expire')}
        >
          Expire now
        </Button>
      )}
      <Button
        variant="destructive"
        icon={<Trash2 aria-hidden="true" className="size-4" />}
        onClick={() => setConfirm('delete')}
      >
        Delete offer
      </Button>
      <ConfirmDialog
        open={confirm === 'expire'}
        onCancel={close}
        title={`Expire "${title}" now?`}
        description="It disappears from the public site at once. You can reactivate it while its end date is in the future."
        confirmLabel="Expire now"
        pending={pending}
        onConfirm={() => run(() => setOfferExpiredAction(offerId, true), close)}
      />
      <ConfirmDialog
        open={confirm === 'reactivate'}
        onCancel={close}
        title={`Reactivate "${title}"?`}
        description="It shows again between its start and end dates, if published."
        confirmLabel="Reactivate"
        pending={pending}
        onConfirm={() => run(() => setOfferExpiredAction(offerId, false), close)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onCancel={close}
        title={`Delete "${title}" permanently?`}
        description="The offer and its item list are removed. The menu items stay. This cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        pending={pending}
        onConfirm={() => run(() => deleteOfferAction(offerId), close)}
      />
    </div>
  )
}
