'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox, TextArea, TextField } from '@/components/ui/field'
import { minutesToHHMM } from '@/lib/format'
import { DAY_NAMES } from '@/lib/validation/admin-content'
import { saveCafeAction, saveHoursAction } from '../content-actions'
import type { FormState } from '../menu-actions'
import { keepValues, useFormToast } from '../menu/item-form'
import { FormError } from './form-bits'

const initial: FormState = { ok: false, message: null, errors: {} }

export type CafeFormValues = {
  name: string
  addressLine: string
  city: string
  postalCode: string | null
  phone: string | null
  email: string | null
  whatsappNumber: string | null
  instagramUrl: string | null
  facebookUrl: string | null
  latitude: number | null
  longitude: number | null
  mapsQuery: string | null
  aboutText: string | null
  studentZoneText: string | null
  offerTerms: string | null
  isPureVegConfirmed: boolean
  addressVerified: boolean
  contactVerified: boolean
  hoursVerified: boolean
  mapVerified: boolean
  socialVerified: boolean
}

/** Café information (UI_SPEC §13 café info). Unverified values stay labelled on the site. */
export function CafeForm({ values: v }: { values: CafeFormValues }) {
  const [state, action, pending] = useActionState(saveCafeAction, initial)
  useFormToast(state)
  const e = state.errors
  const val = (x: string | number | null) => (x === null ? '' : String(x))

  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-space-lg" noValidate>
      <fieldset className="grid gap-space-md md:grid-cols-2">
        <legend className="mb-space-sm text-headline-sm">Address and contact</legend>
        <TextField
          label="Café name"
          name="name"
          required
          maxLength={80}
          defaultValue={v.name}
          error={e.name}
        />
        <TextField
          label="City"
          name="city"
          required
          maxLength={60}
          defaultValue={v.city}
          error={e.city}
        />
        <TextField
          label="Address"
          name="addressLine"
          required
          maxLength={200}
          defaultValue={v.addressLine}
          error={e.addressLine}
        />
        <TextField
          label="PIN code"
          name="postalCode"
          inputMode="numeric"
          maxLength={10}
          defaultValue={val(v.postalCode)}
          error={e.postalCode}
        />
        <TextField
          label="Phone"
          name="phone"
          type="tel"
          maxLength={20}
          defaultValue={val(v.phone)}
          error={e.phone}
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          maxLength={120}
          defaultValue={val(v.email)}
          error={e.email}
        />
        <TextField
          label="WhatsApp number"
          name="whatsappNumber"
          inputMode="numeric"
          maxLength={15}
          defaultValue={val(v.whatsappNumber)}
          hint="Digits with country code, e.g. 919876543210"
          error={e.whatsappNumber}
        />
      </fieldset>

      <fieldset className="grid gap-space-md md:grid-cols-2">
        <legend className="mb-space-sm text-headline-sm">Social and map</legend>
        <TextField
          label="Instagram link"
          name="instagramUrl"
          type="url"
          maxLength={300}
          defaultValue={val(v.instagramUrl)}
          hint="https://instagram.com/…"
          error={e.instagramUrl}
        />
        <TextField
          label="Facebook link"
          name="facebookUrl"
          type="url"
          maxLength={300}
          defaultValue={val(v.facebookUrl)}
          hint="https://facebook.com/…"
          error={e.facebookUrl}
        />
        <TextField
          label="Latitude"
          name="latitude"
          inputMode="decimal"
          defaultValue={val(v.latitude)}
          error={e.latitude}
        />
        <TextField
          label="Longitude"
          name="longitude"
          inputMode="decimal"
          defaultValue={val(v.longitude)}
          error={e.longitude}
        />
        <div className="md:col-span-2">
          <TextField
            label="Google Maps place"
            name="mapsQuery"
            maxLength={200}
            defaultValue={val(v.mapsQuery)}
            hint="The place exactly as listed on Google Maps; the map and directions open it (ADR-046)"
            error={e.mapsQuery}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-space-md">
        <legend className="mb-space-sm text-headline-sm">Texts</legend>
        <TextArea
          label="About the café"
          name="aboutText"
          maxLength={1000}
          defaultValue={val(v.aboutText)}
          error={e.aboutText}
        />
        <TextArea
          label="Student Zone text"
          name="studentZoneText"
          maxLength={1000}
          defaultValue={val(v.studentZoneText)}
          hint="Do not promise student-ID discounts: no ID check exists"
          error={e.studentZoneText}
        />
        <TextArea
          label="Offer terms"
          name="offerTerms"
          maxLength={1000}
          defaultValue={val(v.offerTerms)}
          error={e.offerTerms}
        />
      </fieldset>

      <fieldset className="grid gap-x-space-lg md:grid-cols-2">
        <legend className="mb-space-sm text-headline-sm">Confirmed by the café</legend>
        <p className="text-body-sm text-on-surface-variant md:col-span-2">
          Tick only what the café has confirmed. Unticked values are shown as placeholders.
        </p>
        <Checkbox
          name="addressVerified"
          label="Address confirmed"
          defaultChecked={v.addressVerified}
        />
        <Checkbox
          name="contactVerified"
          label="Phone / email / WhatsApp confirmed"
          defaultChecked={v.contactVerified}
        />
        <Checkbox
          name="hoursVerified"
          label="Opening hours confirmed"
          defaultChecked={v.hoursVerified}
        />
        <Checkbox
          name="mapVerified"
          label="Map location confirmed"
          defaultChecked={v.mapVerified}
        />
        <Checkbox
          name="socialVerified"
          label="Social links confirmed"
          defaultChecked={v.socialVerified}
        />
        <Checkbox
          name="isPureVegConfirmed"
          label="Outlet is 100% vegetarian"
          description='Shows the "100% VEG" mark'
          defaultChecked={v.isPureVegConfirmed}
        />
      </fieldset>

      <FormError state={state} />
      <div>
        <Button type="submit" loading={pending}>
          Save café information
        </Button>
      </div>
    </form>
  )
}

export type DayValue = {
  dayOfWeek: number
  isClosed: boolean
  opensAtMin: number
  closesAtMin: number
}

/** Opening hours, Sunday…Saturday, same-day ranges only (past midnight: Q-05). */
export function HoursForm({ days }: { days: DayValue[] }) {
  const [state, action, pending] = useActionState(saveHoursAction, initial)
  useFormToast(state)
  const byDay = new Map(days.map((d) => [d.dayOfWeek, d]))
  const [closed, setClosed] = useState(() =>
    DAY_NAMES.map((_, i) => byDay.get(i)?.isClosed ?? false),
  )

  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-space-md" noValidate>
      <ul className="flex flex-col divide-y divide-surface-container">
        {DAY_NAMES.map((name, d) => {
          const day = byDay.get(d)
          const err = state.errors[`day_${d}`]
          return (
            <li
              key={name}
              className="grid gap-space-sm py-space-sm md:grid-cols-[8rem_1fr_1fr_auto] md:items-end"
            >
              <p className="text-label-lg md:pb-3">{name}</p>
              <TextField
                label={`${name} opens`}
                name={`opens_${d}`}
                type="time"
                disabled={closed[d]}
                defaultValue={day && !day.isClosed ? minutesToHHMM(day.opensAtMin) : '10:00'}
                error={err}
              />
              <TextField
                label={`${name} closes`}
                name={`closes_${d}`}
                type="time"
                disabled={closed[d]}
                defaultValue={
                  day && !day.isClosed ? minutesToHHMM(day.closesAtMin % 1440) : '22:00'
                }
              />
              <Checkbox
                name={`closed_${d}`}
                label="Closed"
                checked={closed[d]}
                onChange={(ev) =>
                  setClosed((c) => c.map((x, i) => (i === d ? ev.target.checked : x)))
                }
              />
            </li>
          )
        })}
      </ul>
      <p className="text-body-sm text-on-surface-variant">
        Closing must be after opening on the same day. Use 00:00 as a closing time for midnight.
      </p>
      <FormError state={state} />
      <div>
        <Button type="submit" loading={pending}>
          Save opening hours
        </Button>
      </div>
    </form>
  )
}
