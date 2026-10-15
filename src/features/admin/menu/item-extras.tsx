'use client'

import { ArrowLeft, ArrowRight, ImagePlus, Plus, RefreshCw, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useActionState, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Checkbox, TextField } from '@/components/ui/field'
import { paiseToRupeesInput } from '@/lib/validation/admin-menu'
import {
  moveItemImageAction,
  removeItemImageAction,
  saveAddOnsAction,
  saveRelationsAction,
  updateImageAltAction,
  uploadItemImageAction,
  type FormState,
} from '../menu-actions'
import { useActionToast } from './item-controls'
import { keepValues, useFormToast } from './item-form'

const initial: FormState = { ok: false, message: null, errors: {} }

function FormError({ state }: { state: FormState }) {
  if (!state.message || state.ok) return null
  return (
    <p
      role="alert"
      className="rounded-xl bg-error-container px-space-md py-space-sm text-body-sm text-on-error-container"
    >
      {state.message}
    </p>
  )
}

// ── Add-ons ──────────────────────────────────────────────────────────────────

type OptionDraft = { name: string; price: string; isAvailable: boolean }
type GroupDraft = { name: string; minSelect: number; maxSelect: number; options: OptionDraft[] }

export type AddOnGroupValue = {
  name: string
  minSelect: number
  maxSelect: number
  options: { name: string; priceDeltaPaise: number; isAvailable: boolean }[]
}

/** Add-on groups and options (display only on the public site: there is no cart). */
export function AddOnsEditor({ itemId, groups }: { itemId: string; groups: AddOnGroupValue[] }) {
  const [draft, setDraft] = useState<GroupDraft[]>(() =>
    groups.map((g) => ({
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      options: g.options.map((o) => ({
        name: o.name,
        price: paiseToRupeesInput(o.priceDeltaPaise),
        isAvailable: o.isAvailable,
      })),
    })),
  )
  const [state, action, pending] = useActionState(saveAddOnsAction.bind(null, itemId), initial)
  useFormToast(state)
  const setGroup = (gi: number, patch: Partial<GroupDraft>) =>
    setDraft((d) => d.map((g, i) => (i === gi ? { ...g, ...patch } : g)))
  const setOption = (gi: number, oi: number, patch: Partial<OptionDraft>) =>
    setGroup(gi, { options: draft[gi]!.options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) })

  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-space-md" noValidate>
      <input type="hidden" name="groups" value={JSON.stringify(draft)} />
      {draft.length === 0 && (
        <p className="text-body-md text-on-surface-variant">No add-ons configured for this item.</p>
      )}
      {draft.map((g, gi) => (
        <fieldset
          key={gi}
          className="flex flex-col gap-space-sm rounded-2xl border border-surface-container p-space-md"
        >
          <legend className="px-1 text-label-md">Group {gi + 1}</legend>
          <div className="grid gap-space-sm md:grid-cols-[1fr_8rem_8rem_auto] md:items-end">
            <TextField
              label="Group name"
              value={g.name}
              maxLength={60}
              onChange={(e) => setGroup(gi, { name: e.target.value })}
            />
            <TextField
              label="Min. choices"
              type="number"
              min={0}
              max={20}
              value={g.minSelect}
              onChange={(e) => setGroup(gi, { minSelect: Number(e.target.value) })}
            />
            <TextField
              label="Max. choices"
              type="number"
              min={1}
              max={20}
              value={g.maxSelect}
              onChange={(e) => setGroup(gi, { maxSelect: Number(e.target.value) })}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDraft((d) => d.filter((_, i) => i !== gi))}
              icon={<Trash2 aria-hidden="true" className="size-4" />}
            >
              Remove group
            </Button>
          </div>
          {g.options.map((o, oi) => (
            <div
              key={oi}
              className="grid gap-space-sm md:grid-cols-[1fr_8rem_auto_auto] md:items-end"
            >
              <TextField
                label={`Option ${oi + 1}`}
                value={o.name}
                maxLength={60}
                onChange={(e) => setOption(gi, oi, { name: e.target.value })}
              />
              <TextField
                label="Extra price (₹)"
                inputMode="decimal"
                value={o.price}
                onChange={(e) => setOption(gi, oi, { price: e.target.value })}
              />
              <Checkbox
                label="Available"
                checked={o.isAvailable}
                onChange={(e) => setOption(gi, oi, { isAvailable: e.target.checked })}
              />
              <Button
                variant="secondary"
                size="sm"
                aria-label={`Remove option ${oi + 1} of group ${gi + 1}`}
                onClick={() => setGroup(gi, { options: g.options.filter((_, i) => i !== oi) })}
                icon={<Trash2 aria-hidden="true" className="size-4" />}
              />
            </div>
          ))}
          <div>
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus aria-hidden="true" className="size-4" />}
              onClick={() =>
                setGroup(gi, {
                  options: [...g.options, { name: '', price: '0', isAvailable: true }],
                })
              }
            >
              Add option
            </Button>
          </div>
        </fieldset>
      ))}
      <FormError state={state} />
      <div className="flex flex-wrap gap-space-sm">
        <Button
          variant="secondary"
          icon={<Plus aria-hidden="true" className="size-4" />}
          onClick={() =>
            setDraft((d) => [
              ...d,
              {
                name: '',
                minSelect: 0,
                maxSelect: 1,
                options: [{ name: '', price: '0', isAvailable: true }],
              },
            ])
          }
        >
          Add group
        </Button>
        <Button type="submit" loading={pending}>
          Save add-ons
        </Button>
      </div>
    </form>
  )
}

// ── Related / bought together ────────────────────────────────────────────────

export function RelationsEditor({
  itemId,
  options,
  related,
  together,
}: {
  itemId: string
  options: { id: string; name: string }[]
  related: string[]
  together: string[]
}) {
  const [state, action, pending] = useActionState(saveRelationsAction.bind(null, itemId), initial)
  useFormToast(state)
  const list = (name: 'related' | 'together', legend: string, selected: string[]) => (
    <fieldset className="flex flex-col">
      <legend className="mb-space-sm text-label-md">{legend}</legend>
      <div className="max-h-72 overflow-y-auto rounded-2xl border border-surface-container p-space-sm">
        {options.map((o) => (
          <Checkbox
            key={o.id}
            name={name}
            value={o.id}
            label={o.name}
            defaultChecked={selected.includes(o.id)}
          />
        ))}
      </div>
    </fieldset>
  )
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-space-md">
      <div className="grid gap-space-lg md:grid-cols-2">
        {list('related', 'Related items (up to 8)', related)}
        {list('together', 'Frequently bought together (up to 8)', together)}
      </div>
      <FormError state={state} />
      <div>
        <Button type="submit" loading={pending}>
          Save linked items
        </Button>
      </div>
    </form>
  )
}

// ── Images ───────────────────────────────────────────────────────────────────

export type ItemImageValue = { id: string; url: string | null; altText: string }

export function ImagesPanel({
  itemId,
  itemName,
  images,
  uploadsEnabled,
}: {
  itemId: string
  itemName: string
  images: ItemImageValue[]
  uploadsEnabled: boolean
}) {
  const [state, action, pending] = useActionState(uploadItemImageAction.bind(null, itemId), initial)
  useFormToast(state)
  const [replaceId, setReplaceId] = useState<string | null>(null)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { pending: busy, run } = useActionToast()
  const replacing = images.find((i) => i.id === replaceId)

  return (
    <div className="flex flex-col gap-space-lg">
      {images.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">
          No images yet: the public site shows a placeholder.
        </p>
      ) : (
        <ul className="grid gap-space-md sm:grid-cols-2 xl:grid-cols-3">
          {images.map((img, index) => (
            <li
              key={img.id}
              className="flex flex-col gap-space-sm rounded-2xl bg-surface-container-low p-space-sm"
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface-container">
                {img.url && (
                  <Image
                    src={img.url}
                    alt={img.altText}
                    fill
                    sizes="320px"
                    className="object-cover"
                  />
                )}
              </div>
              <p className="text-label-md text-on-surface-variant">
                {index === 0 ? 'Main photo' : `Photo ${index + 1}`}
              </p>
              <AltEditor itemId={itemId} image={img} />
              <div className="flex flex-wrap gap-space-sm">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!uploadsEnabled}
                  icon={<RefreshCw aria-hidden="true" className="size-4" />}
                  onClick={() => {
                    setReplaceId(img.id)
                    fileRef.current?.focus()
                  }}
                >
                  Replace
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Move photo ${index + 1} earlier`}
                  disabled={index === 0 || busy}
                  icon={<ArrowLeft aria-hidden="true" className="size-4" />}
                  onClick={() => run(() => moveItemImageAction(itemId, img.id, -1))}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Move photo ${index + 1} later`}
                  disabled={index === images.length - 1 || busy}
                  icon={<ArrowRight aria-hidden="true" className="size-4" />}
                  onClick={() => run(() => moveItemImageAction(itemId, img.id, 1))}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Trash2 aria-hidden="true" className="size-4" />}
                  onClick={() => setRemoveId(img.id)}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {uploadsEnabled ? (
        <form
          onSubmit={keepValues(action)}
          className="flex flex-col gap-space-md rounded-2xl border border-dashed border-outline p-space-md"
          noValidate
        >
          <h3 className="text-label-lg">
            {replacing ? `Replace image: ${replacing.altText}` : 'Upload an image'}
          </h3>
          {replaceId && <input type="hidden" name="replaceImageId" value={replaceId} />}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="item-image-file" className="text-label-md">
              Image file{' '}
              <span aria-hidden="true" className="text-error">
                *
              </span>
            </label>
            <input
              ref={fileRef}
              id="item-image-file"
              name="file"
              type="file"
              required
              accept="image/jpeg,image/png,image/webp"
              aria-describedby="item-image-hint"
              className="text-body-sm file:mr-space-md file:min-h-12 file:rounded-full file:border-0 file:bg-surface-container file:px-space-md file:font-bold file:text-primary"
            />
            <p id="item-image-hint" className="text-body-sm text-on-surface-variant">
              JPEG, PNG or WebP, up to 5 MB, at least 200×200 px. Saved as WebP without location
              data.
            </p>
          </div>
          <TextField
            label="Alt text"
            name="altText"
            required
            maxLength={150}
            defaultValue={itemName}
            hint="Describe the photo for screen-reader users"
            error={state.errors.altText}
          />
          <FormError state={state} />
          <div className="flex flex-wrap gap-space-sm">
            <Button
              type="submit"
              loading={pending}
              icon={<ImagePlus aria-hidden="true" className="size-4" />}
            >
              {replacing ? 'Upload replacement' : 'Upload image'}
            </Button>
            {replacing && (
              <Button variant="secondary" onClick={() => setReplaceId(null)}>
                Cancel replace
              </Button>
            )}
          </div>
        </form>
      ) : (
        <p
          role="status"
          className="rounded-xl bg-surface-container-high px-space-md py-space-sm text-body-sm"
        >
          Image uploads are switched off: the server has no Storage key (SUPABASE_SECRET_KEY). See
          DEPLOYMENT.md §7.
        </p>
      )}

      <ConfirmDialog
        open={removeId !== null}
        onCancel={() => setRemoveId(null)}
        title="Remove this image?"
        description="The file is deleted from Storage. This cannot be undone."
        confirmLabel="Remove image"
        destructive
        pending={busy}
        onConfirm={() =>
          run(
            () => removeItemImageAction(itemId, removeId!),
            () => setRemoveId(null),
          )
        }
      />
    </div>
  )
}

function AltEditor({ itemId, image }: { itemId: string; image: ItemImageValue }) {
  const [alt, setAlt] = useState(image.altText)
  const { pending, run } = useActionToast()
  return (
    <div className="flex items-end gap-space-sm">
      <TextField
        label="Alt text"
        value={alt}
        maxLength={150}
        onChange={(e) => setAlt(e.target.value)}
        className="flex-1"
      />
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        disabled={alt === image.altText}
        onClick={() => run(() => updateImageAltAction(itemId, image.id, alt))}
      >
        Save
      </Button>
    </div>
  )
}
