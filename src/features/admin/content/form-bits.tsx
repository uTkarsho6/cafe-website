'use client'

import type { FormState } from '../menu-actions'

/** Form-level error banner (field errors are shown next to their fields). */
export function FormError({ state }: { state: FormState }) {
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

/** File input for one image (JPEG/PNG/WebP, validated again on the server, ADR-049). */
export function ImageInput({
  id,
  label,
  required,
  error,
  hint = 'JPEG, PNG or WebP, up to 5 MB, at least 200×200 px. Saved as WebP without location data.',
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label-md">
        {label}
        {required && (
          <span aria-hidden="true" className="text-error">
            {' '}
            *
          </span>
        )}
      </label>
      <input
        id={id}
        name="file"
        type="file"
        required={required}
        accept="image/jpeg,image/png,image/webp"
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-${error ? 'error' : 'hint'}`}
        className="text-body-sm file:mr-space-md file:min-h-12 file:rounded-full file:border-0 file:bg-surface-container file:px-space-md file:font-bold file:text-primary"
      />
      {error ? (
        <p id={`${id}-error`} className="text-body-sm text-error">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-body-sm text-on-surface-variant">
          {hint}
        </p>
      )}
    </div>
  )
}

export function UploadsOff() {
  return (
    <p
      role="status"
      className="rounded-xl bg-surface-container-high px-space-md py-space-sm text-body-sm"
    >
      Image uploads are switched off: the server has no Storage key (SUPABASE_SECRET_KEY). See
      DEPLOYMENT.md §7.
    </p>
  )
}
