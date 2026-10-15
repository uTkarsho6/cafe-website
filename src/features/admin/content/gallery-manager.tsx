'use client'

import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useActionState, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Checkbox, TextField } from '@/components/ui/field'
import {
  deleteGalleryImageAction,
  moveGalleryImageAction,
  updateGalleryImageAction,
  uploadGalleryImageAction,
} from '../content-actions'
import type { FormState } from '../menu-actions'
import { useActionToast } from '../menu/item-controls'
import { keepValues, useFormToast } from '../menu/item-form'
import { FormError, ImageInput, UploadsOff } from './form-bits'

export type GalleryRow = {
  id: string
  url: string | null
  altText: string
  caption: string | null
  isPublished: boolean
  isDemo: boolean
}

const initial: FormState = { ok: false, message: null, errors: {} }

/** Gallery management (UI_SPEC §13): upload, alt text, caption, order, publish, remove. */
export function GalleryManager({
  images,
  uploadsEnabled,
}: {
  images: GalleryRow[]
  uploadsEnabled: boolean
}) {
  const [removeId, setRemoveId] = useState<string | null>(null)
  const { pending, run } = useActionToast()

  return (
    <div className="flex flex-col gap-space-xl">
      <section
        aria-labelledby="add-photo"
        className="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"
      >
        <h2 id="add-photo" className="mb-space-md text-headline-sm">
          Add a photo
        </h2>
        {uploadsEnabled ? <UploadForm /> : <UploadsOff />}
      </section>

      <section aria-labelledby="all-photos" className="flex flex-col gap-space-md">
        <h2 id="all-photos" className="text-headline-sm">
          Photos ({images.length})
        </h2>
        {images.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">
            No photos yet. The public gallery page says photos are coming soon.
          </p>
        ) : (
          <ul className="grid gap-space-md sm:grid-cols-2 xl:grid-cols-3">
            {images.map((img, index) => (
              <li
                key={img.id}
                data-testid="gallery-admin-item"
                className="flex flex-col gap-space-sm rounded-2xl bg-surface-container-lowest p-space-sm shadow-sm"
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
                <div className="flex flex-wrap gap-1">
                  <Badge tone={img.isPublished ? 'neutral' : 'scheduled'}>
                    {img.isPublished ? 'Published' : 'Hidden'}
                  </Badge>
                  {img.isDemo && <Badge tone="demo">Demo</Badge>}
                </div>
                <PhotoForm image={img} />
                <div className="flex flex-wrap gap-space-sm">
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Move photo ${index + 1} earlier`}
                    disabled={index === 0 || pending}
                    icon={<ArrowLeft aria-hidden="true" className="size-4" />}
                    onClick={() => run(() => moveGalleryImageAction(img.id, -1))}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Move photo ${index + 1} later`}
                    disabled={index === images.length - 1 || pending}
                    icon={<ArrowRight aria-hidden="true" className="size-4" />}
                    onClick={() => run(() => moveGalleryImageAction(img.id, 1))}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
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
      </section>

      <ConfirmDialog
        open={removeId !== null}
        onCancel={() => setRemoveId(null)}
        title="Remove this photo?"
        description="It is deleted from the gallery and from Storage. This cannot be undone."
        confirmLabel="Remove photo"
        destructive
        pending={pending}
        onConfirm={() =>
          run(
            () => deleteGalleryImageAction(removeId!),
            () => setRemoveId(null),
          )
        }
      />
    </div>
  )
}

function UploadForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const result = await uploadGalleryImageAction(prev, form)
    if (result.ok) formRef.current?.reset()
    return result
  }, initial)
  useFormToast(state)
  return (
    <form
      ref={formRef}
      onSubmit={keepValues(action)}
      className="grid gap-space-md md:grid-cols-2"
      noValidate
    >
      <div className="md:col-span-2">
        <ImageInput id="gallery-file" label="Photo" required error={state.errors.file} />
      </div>
      <TextField
        label="Alt text"
        name="altText"
        required
        maxLength={150}
        hint="Describe the photo for screen-reader users"
        error={state.errors.altText}
      />
      <TextField label="Caption" name="caption" maxLength={120} error={state.errors.caption} />
      <Checkbox name="isPublished" label="Publish now" defaultChecked />
      <div className="md:col-span-2">
        <FormError state={state} />
      </div>
      <div>
        <Button
          type="submit"
          loading={pending}
          icon={<ImagePlus aria-hidden="true" className="size-4" />}
        >
          Upload photo
        </Button>
      </div>
    </form>
  )
}

function PhotoForm({ image }: { image: GalleryRow }) {
  const [state, action, pending] = useActionState(
    updateGalleryImageAction.bind(null, image.id),
    initial,
  )
  useFormToast(state)
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-space-sm" noValidate>
      <TextField
        label="Alt text"
        name="altText"
        required
        maxLength={150}
        defaultValue={image.altText}
        error={state.errors.altText}
      />
      <TextField
        label="Caption"
        name="caption"
        maxLength={120}
        defaultValue={image.caption ?? ''}
        error={state.errors.caption}
      />
      <Checkbox name="isPublished" label="Published" defaultChecked={image.isPublished} />
      <FormError state={state} />
      <div>
        <Button type="submit" size="sm" variant="secondary" loading={pending}>
          Save photo
        </Button>
      </div>
    </form>
  )
}
