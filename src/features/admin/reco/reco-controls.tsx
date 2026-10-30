'use client'

import { RefreshCw } from 'lucide-react'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { TextField } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { useActionToast } from '../menu/item-controls'
import { keepValues, useFormToast } from '../menu/item-form'
import {
  activateRunAction,
  retrainAction,
  saveRecoWeightsAction,
  setRecoEnabledAction,
} from '../reco-actions'
import type { FormState } from '../action-utils'

/** "Show recommendations on the website" (optimistic; reverts if the server refuses). */
export function RecoEnabledSwitch({ enabled }: { enabled: boolean }) {
  const [checked, setChecked] = useState(enabled)
  const { pending, run } = useActionToast()
  return (
    <Switch
      checked={checked}
      disabled={pending}
      showLabel
      label="Show recommendations on the website"
      onCheckedChange={(next) => {
        setChecked(next)
        run(
          () => setRecoEnabledAction(next),
          (r) => !r.ok && setChecked(!next),
        )
      }}
    />
  )
}

export function RetrainButton({ training }: { training: boolean }) {
  const { pending, run } = useActionToast()
  return (
    <Button
      loading={pending}
      disabled={training}
      icon={<RefreshCw aria-hidden="true" className="size-4" />}
      onClick={() => run(() => retrainAction())}
    >
      {pending ? 'Training…' : training ? 'Training in progress' : 'Retrain now'}
    </Button>
  )
}

export function ActivateRunButton({ runId, version }: { runId: string; version: number }) {
  const [open, setOpen] = useState(false)
  const { pending, run } = useActionToast()
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Activate<span className="sr-only"> version {version}</span>
      </Button>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          run(
            () => activateRunAction(runId),
            () => setOpen(false),
          )
        }
        title={`Activate version ${version}?`}
        description="The website switches to this version's lists right away. You can switch back at any time."
        confirmLabel={`Activate version ${version}`}
        pending={pending}
      />
    </>
  )
}

type Weights = Record<
  'compCoocPm' | 'compQualityPm' | 'compContentPm' | 'simContentPm' | 'simTastePm' | 'simQualityPm',
  number
>

const GROUPS = [
  {
    title: 'Goes well with',
    fields: [
      ['compCoocPm', 'Co-occurrence'],
      ['compQualityPm', 'Quality'],
      ['compContentPm', 'Content'],
    ],
  },
  {
    title: 'You may also like',
    fields: [
      ['simContentPm', 'Content'],
      ['simTastePm', 'Taste'],
      ['simQualityPm', 'Quality'],
    ],
  },
] as const

const initial: FormState = { ok: false, message: null, errors: {} }

/** Six weights (0–1000) with the normalised share shown live next to each (TC-COMP-032). */
export function WeightsForm({ weights }: { weights: Weights }) {
  const [state, action, pending] = useActionState(saveRecoWeightsAction, initial)
  const [values, setValues] = useState<Weights>(weights)
  useFormToast(state)
  return (
    <form onSubmit={keepValues(action)} noValidate className="flex flex-col gap-space-md">
      <div className="grid gap-space-lg md:grid-cols-2">
        {GROUPS.map((g) => {
          const sum = g.fields.reduce((n, [k]) => n + (Number(values[k]) || 0), 0)
          return (
            <fieldset key={g.title} className="flex flex-col gap-space-sm">
              <legend className="mb-space-xs text-label-lg">{g.title}</legend>
              {g.fields.map(([key, label]) => {
                const share = sum > 0 ? Math.round(((Number(values[key]) || 0) / sum) * 100) : 0
                return (
                  <TextField
                    key={key}
                    label={label}
                    name={key}
                    type="number"
                    min={0}
                    max={1000}
                    step={1}
                    inputMode="numeric"
                    value={String(values[key])}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [key]: e.target.value as unknown as number }))
                    }
                    hint={`${share} % of this list's score`}
                    error={state.errors[key]}
                  />
                )
              })}
            </fieldset>
          )
        })}
      </div>
      <p className="text-body-sm text-on-surface-variant">
        Only the ratio inside each list matters. New weights apply from the next training run.
      </p>
      <div>
        <Button type="submit" variant="secondary" loading={pending}>
          Save weights
        </Button>
      </div>
    </form>
  )
}
