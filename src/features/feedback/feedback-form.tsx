'use client'

import { Check, CircleCheck, Plus } from 'lucide-react'
import { startTransition, useActionState, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { TextArea, TextField } from '@/components/ui/field'
import { FEEDBACK_MAX, FEEDBACK_TAGS, FEEDBACK_TAG_KEYS } from '@/lib/validation/feedback'
import { submitFeedbackAction, type FeedbackState } from './actions'

const initial: FeedbackState = { status: 'idle', message: null, errors: {} }

/** Feedback form (UI_SPEC §12.9). Errors keep what the guest typed; success clears the form. */
export function FeedbackForm() {
  const [state, action, pending] = useActionState(submitFeedbackAction, initial)
  const [length, setLength] = useState(0)

  if (state.status === 'success') {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-space-md py-space-lg text-center"
      >
        <CircleCheck aria-hidden="true" className="size-12 text-tertiary" />
        <p className="text-headline-sm">{state.message}</p>
        <p className="text-body-md text-on-surface-variant">
          Only feedback the café approves is shown on the site.
        </p>
      </div>
    )
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    startTransition(() => action(form))
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-space-md" noValidate>
      {state.status === 'error' && state.message && (
        <p
          role="alert"
          className="rounded-xl bg-error-container px-space-md py-space-sm text-body-sm text-on-error-container"
        >
          {state.message}
        </p>
      )}
      <TextField
        label="Your name or nickname (optional)"
        name="displayName"
        maxLength={40}
        autoComplete="nickname"
        error={state.errors.displayName}
      />
      <TextArea
        label="Your feedback"
        name="message"
        required
        minLength={10}
        maxLength={FEEDBACK_MAX}
        onChange={(e) => setLength(e.target.value.length)}
        error={state.errors.message}
        aside={
          <span className="text-body-sm text-on-surface-variant" aria-live="polite">
            {length}/{FEEDBACK_MAX}
          </span>
        }
      />
      {/* Quick highlights (ADR-062): real checkboxes styled as pills, so keyboard and screen
          readers get native checkbox behaviour; ticked ones are sent as `tags`. */}
      <fieldset
        className="flex flex-col gap-space-xs"
        aria-describedby={state.errors.tags ? 'tags-error' : undefined}
      >
        <legend className="mb-space-xs text-label-lg text-on-surface">
          Quick highlights <span className="font-normal text-on-surface-variant">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-space-xs">
          {FEEDBACK_TAG_KEYS.map((key) => (
            <label
              key={key}
              className="relative inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface-container-lowest px-space-md text-label-md text-on-surface-variant transition-colors select-none hover:border-primary/40 has-checked:border-primary has-checked:bg-primary has-checked:text-on-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary lg:min-h-10"
            >
              <input type="checkbox" name="tags" value={key} className="peer sr-only" />
              <Plus aria-hidden="true" className="size-3.5 peer-checked:hidden" />
              <Check aria-hidden="true" className="hidden size-3.5 peer-checked:block" />
              {FEEDBACK_TAGS[key]}
            </label>
          ))}
        </div>
        {state.errors.tags && (
          <p id="tags-error" className="text-body-sm text-error">
            {state.errors.tags}
          </p>
        )}
      </fieldset>
      {/* Honeypot (ADR-026): hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <p className="text-body-sm text-on-surface-variant">
        Your feedback is reviewed before it appears publicly. We don&apos;t collect your email or
        phone.
      </p>
      <div>
        <Button type="submit" loading={pending}>
          Send feedback
        </Button>
      </div>
    </form>
  )
}
