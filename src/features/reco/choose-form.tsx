'use client'

import { Cookie, CupSoda, IceCreamCone, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import Form from 'next/form'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { Button, buttonClasses } from '@/components/ui/button'
import { PRICE_BANDS } from '@/lib/validation/public'
import {
  BUDGET_KEYS,
  FLAVOR_TAG_KEYS,
  FLAVOR_TAGS,
  MAX_CHOOSE_TAGS,
  MOOD_KEYS,
  MOODS,
  type BudgetKey,
  type MoodKey,
} from '@/lib/validation/reco'
import type { ChooseParams } from './choose-params'

/**
 * Help me choose form (UI_SPEC §12.12, TC-COMP-031). A GET form of native radios and checkboxes
 * styled as pills (the feedback-highlight technique, ADR-062), so it works without JavaScript and
 * screen readers get native controls. With JavaScript, next/form navigates client-side and a
 * fourth flavour tick is undone with an inline hint; the server refuses more than 3 as well.
 */

const MOOD_ICONS: Record<MoodKey, LucideIcon> = {
  meal: UtensilsCrossed,
  snack: Cookie,
  drink: CupSoda,
  sweet: IceCreamCone,
}
const budgetLabel = (b: BudgetKey) => (b === 'any' ? 'Any' : PRICE_BANDS[b].label)

// UI_SPEC §7.3 selectable chip = the category pill on a native input inside a `relative` label.
const chip =
  'relative inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-full bg-surface-container px-space-md py-2 text-label-md text-on-surface-variant transition-colors select-none hover:text-on-surface has-checked:bg-primary has-checked:text-on-primary has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary lg:min-h-10'

function Group({
  legend,
  hint,
  error,
  errorId,
  children,
}: {
  legend: string
  hint?: string
  error?: string | null
  errorId?: string
  children: ReactNode
}) {
  return (
    <fieldset
      className="flex min-w-0 flex-col gap-space-sm"
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="mb-space-sm text-headline-sm text-on-surface">
        {legend}
        {hint && (
          <span className="block text-body-sm font-normal text-on-surface-variant">{hint}</span>
        )}
      </legend>
      <div className="flex flex-wrap gap-space-xs">{children}</div>
      {error && (
        <p id={errorId} role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
    </fieldset>
  )
}

export function ChooseForm({ params }: { params: ChooseParams }) {
  const [tagHint, setTagHint] = useState<string | null>(
    params.tooManyTags ? `Choose up to ${MAX_CHOOSE_TAGS} flavours.` : null,
  )
  return (
    <Form
      action="/help-me-choose"
      scroll={false}
      aria-label="Help me choose"
      className="flex flex-col gap-space-lg rounded-3xl bg-surface-container-lowest p-space-lg shadow-sm"
    >
      <div className="grid gap-space-lg lg:grid-cols-3">
        <Group legend="What are you in the mood for?">
          {MOOD_KEYS.map((m) => {
            const Icon = MOOD_ICONS[m]
            return (
              <label key={m} className={chip}>
                <input
                  type="radio"
                  name="mood"
                  value={m}
                  required
                  defaultChecked={params.mood === m}
                  className="sr-only"
                />
                <Icon aria-hidden="true" className="size-[18px]" />
                {MOODS[m]}
              </label>
            )
          })}
        </Group>

        <Group legend="Budget per person">
          {BUDGET_KEYS.map((b) => (
            <label key={b} className={chip}>
              <input
                type="radio"
                name="budget"
                value={b}
                defaultChecked={params.budget === b}
                className="sr-only"
              />
              {budgetLabel(b)}
            </label>
          ))}
        </Group>

        <Group
          legend="Flavours you like"
          hint={`Optional, up to ${MAX_CHOOSE_TAGS}`}
          error={tagHint}
          errorId="tags-hint"
        >
          {FLAVOR_TAG_KEYS.map((t) => (
            <label key={t} className={chip}>
              <input
                type="checkbox"
                name="tags"
                value={t}
                defaultChecked={params.tags.includes(t)}
                className="sr-only"
                onChange={(e) => {
                  const ticked = e.currentTarget.form?.querySelectorAll(
                    'input[name="tags"]:checked',
                  ).length
                  if (e.currentTarget.checked && (ticked ?? 0) > MAX_CHOOSE_TAGS) {
                    e.currentTarget.checked = false
                    setTagHint(`You can choose up to ${MAX_CHOOSE_TAGS} flavours.`)
                  } else setTagHint(null)
                }}
              />
              {FLAVOR_TAGS[t]}
            </label>
          ))}
        </Group>
      </div>

      <div className="flex flex-col gap-space-sm sm:flex-row">
        <Button type="submit" className="w-full sm:w-auto">
          Show suggestions
        </Button>
        <Link
          href="/help-me-choose"
          className={buttonClasses({ variant: 'ghost', className: 'w-full sm:w-auto' })}
        >
          Start over
        </Link>
      </div>
    </Form>
  )
}
