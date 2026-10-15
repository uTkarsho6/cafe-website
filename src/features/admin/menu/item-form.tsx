'use client'

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox, Select, TextArea, TextField } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { paiseToRupeesInput } from '@/lib/validation/admin-menu'
import { saveItemAction, type FormState } from '../menu-actions'

export type ItemFormValues = {
  id?: string
  name: string
  description: string
  pricePaise: number | null
  categoryId: string
  dietType: string
  isAvailable: boolean
  isPublished: boolean
  isBestSeller: boolean
  isTrending: boolean
  isFeatured: boolean
  sortOrder: number
}

const initial: FormState = { ok: false, message: null, errors: {} }

/** Shows a toast when a form action finishes; field errors stay next to the fields. */
export function useFormToast(state: FormState) {
  const toast = useToast()
  const last = useRef(state)
  useEffect(() => {
    if (state !== last.current && state.message)
      toast.show(state.message, state.ok ? 'success' : 'error')
    last.current = state
  }, [state, toast])
}

/**
 * Submits through the action without React's automatic form reset, so a validation error does
 * not wipe what the admin typed.
 */
export function keepValues(action: (form: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    startTransition(() => action(form))
  }
}

/** Create / edit form for a menu item (UI_SPEC §13 menu management). */
export function ItemForm({
  values,
  categories,
}: {
  values: ItemFormValues
  categories: { id: string; name: string; isArchived: boolean }[]
}) {
  const [state, action, pending] = useActionState(saveItemAction, initial)
  useFormToast(state)
  const e = state.errors

  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-space-md" noValidate>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="grid gap-space-md md:grid-cols-2">
        <TextField
          label="Name"
          name="name"
          required
          maxLength={80}
          defaultValue={values.name}
          error={e.name}
        />
        <TextField
          label="Price (₹)"
          name="price"
          required
          inputMode="decimal"
          defaultValue={values.pricePaise === null ? '' : paiseToRupeesInput(values.pricePaise)}
          hint="Rupees, e.g. 149 or 149.50"
          error={e.price}
        />
        <Select
          label="Category"
          name="categoryId"
          required
          defaultValue={values.categoryId}
          error={e.categoryId}
        >
          <option value="">Choose a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.isArchived ? ' (archived)' : ''}
            </option>
          ))}
        </Select>
        <Select
          label="Diet"
          name="dietType"
          required
          defaultValue={values.dietType}
          error={e.dietType}
        >
          <option value="VEG">Veg</option>
          <option value="EGG">Egg</option>
          <option value="NON_VEG">Non-veg</option>
        </Select>
      </div>
      <TextArea
        label="Description"
        name="description"
        required
        maxLength={600}
        defaultValue={values.description}
        error={e.description}
      />
      <TextField
        label="Sort order"
        name="sortOrder"
        type="number"
        min={0}
        max={9999}
        defaultValue={values.sortOrder}
        hint="Lower numbers appear first within the category"
        error={e.sortOrder}
        className="md:max-w-48"
      />
      <fieldset className="grid gap-x-space-lg md:grid-cols-2">
        <legend className="mb-space-sm text-label-md">Visibility and labels</legend>
        <Checkbox
          name="isAvailable"
          label="Available"
          description="Off = shown as out of stock"
          defaultChecked={values.isAvailable}
        />
        <Checkbox
          name="isPublished"
          label="Published"
          description="Off = hidden from the public site"
          defaultChecked={values.isPublished}
        />
        <Checkbox name="isBestSeller" label="Best seller" defaultChecked={values.isBestSeller} />
        <Checkbox name="isTrending" label="Trending" defaultChecked={values.isTrending} />
        <Checkbox
          name="isFeatured"
          label="Featured on the home page"
          defaultChecked={values.isFeatured}
        />
      </fieldset>
      {state.message && !state.ok && (
        <p
          role="alert"
          className="rounded-xl bg-error-container px-space-md py-space-sm text-body-sm text-on-error-container"
        >
          {state.message}
        </p>
      )}
      <div>
        <Button type="submit" loading={pending}>
          {values.id ? 'Save changes' : 'Create item'}
        </Button>
      </div>
    </form>
  )
}
