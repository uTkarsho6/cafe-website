'use client'

import { Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Checkbox, TextField } from '@/components/ui/field'
import { deleteBannerAction, saveBannerAction } from '../content-actions'
import type { FormState } from '../menu-actions'
import { useActionToast } from '../menu/item-controls'
import { keepValues, useFormToast } from '../menu/item-form'
import { FormError, ImageInput, UploadsOff } from './form-bits'

export type BannerFormValues = {
  id?: string
  title: string
  subtitle: string
  altText: string
  ctaLabel: string
  ctaHref: string
  startsAt: string
  endsAt: string
  isPublished: boolean
  sortOrder: number
  imageUrl: string | null
}

const initial: FormState = { ok: false, message: null, errors: {} }

/** Home page banner (UI_SPEC §13 banners). Links: internal paths or https only (ADR-050). */
export function BannerForm({
  values,
  uploadsEnabled,
}: {
  values: BannerFormValues
  uploadsEnabled: boolean
}) {
  const [state, action, pending] = useActionState(saveBannerAction, initial)
  useFormToast(state)
  const e = state.errors
  const canSave = uploadsEnabled || Boolean(values.id)

  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-space-md" noValidate>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <TextField
        label="Title"
        name="title"
        required
        maxLength={80}
        defaultValue={values.title}
        error={e.title}
      />
      <TextField
        label="Subtitle"
        name="subtitle"
        maxLength={160}
        defaultValue={values.subtitle}
        error={e.subtitle}
      />
      <div className="grid gap-space-md md:grid-cols-2">
        <TextField
          label="Button text"
          name="ctaLabel"
          maxLength={30}
          defaultValue={values.ctaLabel}
          hint="Optional, e.g. View offers"
          error={e.ctaLabel}
        />
        <TextField
          label="Button link"
          name="ctaHref"
          maxLength={300}
          defaultValue={values.ctaHref}
          hint="A page of this site (/offers) or an https:// address"
          error={e.ctaHref}
        />
        <TextField
          label="Show from (India time)"
          name="startsAt"
          type="datetime-local"
          defaultValue={values.startsAt}
          hint="Optional"
          error={e.startsAt}
        />
        <TextField
          label="Show until (India time)"
          name="endsAt"
          type="datetime-local"
          defaultValue={values.endsAt}
          hint="Optional"
          error={e.endsAt}
        />
      </div>
      <div className="grid gap-space-md md:grid-cols-2">
        <Checkbox
          name="isPublished"
          label="Published"
          description="Off = hidden from the home page"
          defaultChecked={values.isPublished}
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
      </div>
      <fieldset className="flex flex-col gap-space-sm">
        <legend className="mb-space-sm text-label-md">Image</legend>
        {values.imageUrl && (
          <div className="relative aspect-[3/1] w-full max-w-md overflow-hidden rounded-xl bg-surface-container">
            <Image
              src={values.imageUrl}
              alt={values.altText}
              fill
              sizes="448px"
              className="object-cover"
            />
          </div>
        )}
        {uploadsEnabled ? (
          <ImageInput
            id="banner-image"
            label={values.id ? 'Replace image (optional)' : 'Image'}
            required={!values.id}
            error={e.file}
          />
        ) : (
          <UploadsOff />
        )}
        <TextField
          label="Image description (alt text)"
          name="altText"
          required
          maxLength={150}
          defaultValue={values.altText}
          error={e.altText}
        />
      </fieldset>
      <FormError state={state} />
      <div>
        <Button type="submit" loading={pending} disabled={!canSave}>
          {values.id ? 'Save banner' : 'Create banner'}
        </Button>
      </div>
    </form>
  )
}

export function DeleteBannerButton({ bannerId, title }: { bannerId: string; title: string }) {
  const [open, setOpen] = useState(false)
  const { pending, run } = useActionToast()
  return (
    <>
      <Button
        variant="destructive"
        icon={<Trash2 aria-hidden="true" className="size-4" />}
        onClick={() => setOpen(true)}
      >
        Delete banner
      </Button>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        title={`Delete "${title}"?`}
        description="The banner and its image are removed. This cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        pending={pending}
        onConfirm={() =>
          run(
            () => deleteBannerAction(bannerId),
            () => setOpen(false),
          )
        }
      />
    </>
  )
}
