'use client'

import { CircleCheck } from 'lucide-react'
import { startTransition, useActionState, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { TextArea, TextField } from '@/components/ui/field'
import { FEEDBACK_MAX } from '@/lib/validation/feedback'
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
