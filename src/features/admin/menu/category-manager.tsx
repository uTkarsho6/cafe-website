'use client'

import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react'
import { useActionState, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Select, TextField } from '@/components/ui/field'
import { MEAL_ROLE_KEYS, MEAL_ROLES } from '@/lib/validation/reco'
import { CATEGORY_ICONS } from '@/lib/validation/admin-menu'
import {
  deleteCategoryAction,
  saveCategoryAction,
  setCategoryArchivedAction,
  type FormState,
} from '../menu-actions'
import { useActionToast } from './item-controls'
import { keepValues, useFormToast } from './item-form'

export type CategoryRow = {
  id: string
  name: string
  description: string | null
  iconKey: string
  mealRole: string
  sortOrder: number
  isArchived: boolean
  isDemo: boolean
  itemCount: number
}

const initial: FormState = { ok: false, message: null, errors: {} }
const iconLabel = (k: string) => k.charAt(0) + k.slice(1).toLowerCase()

function CategoryForm({ value, onSaved }: { value?: CategoryRow; onSaved?: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const result = await saveCategoryAction(prev, form)
    if (result.ok) onSaved?.()
    return result
  }, initial)
  useFormToast(state)
  const e = state.errors
  return (
    <form onSubmit={keepValues(action)} className="grid gap-space-md md:grid-cols-2" noValidate>
      {value && <input type="hidden" name="id" value={value.id} />}
      <TextField
        label="Name"
        name="name"
        required
        maxLength={60}
        defaultValue={value?.name}
        error={e.name}
      />
      <Select
        label="Icon"
        name="iconKey"
        defaultValue={value?.iconKey ?? 'GENERAL'}
        error={e.iconKey}
      >
        {CATEGORY_ICONS.map((k) => (
          <option key={k} value={k}>
            {iconLabel(k)}
          </option>
        ))}
      </Select>
      <Select
        label="Meal role"
        name="mealRole"
        defaultValue={value?.mealRole ?? 'MAIN'}
        hint="Used by recommendations: “Goes well with” pairs different roles"
        error={e.mealRole}
      >
        {MEAL_ROLE_KEYS.map((k) => (
          <option key={k} value={k}>
            {MEAL_ROLES[k]}
          </option>
        ))}
      </Select>
      <TextField
        label="Description"
        name="description"
        maxLength={200}
        defaultValue={value?.description ?? ''}
        error={e.description}
      />
      <TextField
        label="Sort order"
        name="sortOrder"
        type="number"
        min={0}
        max={9999}
        defaultValue={value?.sortOrder ?? 0}
        error={e.sortOrder}
      />
      {state.message && !state.ok && (
        <p
          role="alert"
          className="rounded-xl bg-error-container px-space-md py-space-sm text-body-sm text-on-error-container md:col-span-2"
        >
          {state.message}
        </p>
      )}
      <div className="md:col-span-2">
        <Button
          type="submit"
          loading={pending}
          icon={value ? undefined : <Plus aria-hidden="true" className="size-4" />}
        >
          {value ? 'Save category' : 'Add category'}
        </Button>
      </div>
    </form>
  )
}

/** Category list with add, edit, archive/restore and delete (UI_SPEC §13). */
export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const [editing, setEditing] = useState<CategoryRow | null>(null)
  const [confirm, setConfirm] = useState<{
    row: CategoryRow
    kind: 'archive' | 'restore' | 'delete'
  } | null>(null)
  const { pending, run } = useActionToast()
  const close = () => setConfirm(null)

  return (
    <div className="flex flex-col gap-space-xl">
      <section
        aria-labelledby="new-category"
        className="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"
      >
        <h2 id="new-category" className="mb-space-md text-headline-sm">
          New category
        </h2>
        <CategoryForm />
      </section>

      <section aria-labelledby="all-categories" className="flex flex-col gap-space-md">
        <h2 id="all-categories" className="text-headline-sm">
          All categories
        </h2>
        <div className="relative overflow-x-auto rounded-2xl bg-surface-container-lowest shadow-sm">
          <table className="w-full min-w-[40rem] text-left text-body-sm">
            <thead className="text-label-md text-on-surface-variant">
              <tr className="border-b border-surface-container">
                <th scope="col" className="px-space-md py-space-sm">
                  Name
                </th>
                <th scope="col" className="px-space-md py-space-sm">
                  Items
                </th>
                <th scope="col" className="px-space-md py-space-sm">
                  Order
                </th>
                <th scope="col" className="px-space-md py-space-sm">
                  Status
                </th>
                <th scope="col" className="px-space-md py-space-sm">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-surface-container last:border-0">
                  <th scope="row" className="px-space-md py-space-sm font-bold">
                    {c.name} {c.isDemo && <Badge tone="demo">Demo</Badge>}
                  </th>
                  <td className="px-space-md py-space-sm">{c.itemCount}</td>
                  <td className="px-space-md py-space-sm">{c.sortOrder}</td>
                  <td className="px-space-md py-space-sm">
                    {c.isArchived ? (
                      <Badge tone="scheduled">Archived</Badge>
                    ) : (
                      <Badge tone="neutral">Active</Badge>
                    )}
                  </td>
                  <td className="px-space-md py-space-sm">
                    <div className="flex justify-end gap-space-sm">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`Edit ${c.name}`}
                        icon={<Pencil aria-hidden="true" className="size-4" />}
                        onClick={() => setEditing(c)}
                      />
                      {c.isArchived ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={`Restore ${c.name}`}
                            icon={<ArchiveRestore aria-hidden="true" className="size-4" />}
                            onClick={() => setConfirm({ row: c, kind: 'restore' })}
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={`Delete ${c.name}`}
                            disabled={c.itemCount > 0}
                            title={c.itemCount > 0 ? 'Move or delete its items first' : undefined}
                            icon={<Trash2 aria-hidden="true" className="size-4" />}
                            onClick={() => setConfirm({ row: c, kind: 'delete' })}
                          />
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={`Archive ${c.name}`}
                          icon={<Archive aria-hidden="true" className="size-4" />}
                          onClick={() => setConfirm({ row: c, kind: 'archive' })}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <Dialog
          open
          onClose={() => setEditing(null)}
          title={`Edit ${editing.name}`}
          className="max-w-2xl"
        >
          <CategoryForm value={editing} onSaved={() => setEditing(null)} />
        </Dialog>
      )}
      <ConfirmDialog
        open={confirm?.kind === 'archive'}
        onCancel={close}
        title={`Archive "${confirm?.row.name}"?`}
        description="The category and all its items disappear from the public menu at once. You can restore it later."
        confirmLabel="Archive"
        pending={pending}
        onConfirm={() =>
          confirm && run(() => setCategoryArchivedAction(confirm.row.id, true), close)
        }
      />
      <ConfirmDialog
        open={confirm?.kind === 'restore'}
        onCancel={close}
        title={`Restore "${confirm?.row.name}"?`}
        description="Its published, unarchived items show on the public menu again."
        confirmLabel="Restore"
        pending={pending}
        onConfirm={() =>
          confirm && run(() => setCategoryArchivedAction(confirm.row.id, false), close)
        }
      />
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        onCancel={close}
        title={`Delete "${confirm?.row.name}" permanently?`}
        description="Only empty categories can be deleted. This cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        pending={pending}
        onConfirm={() => confirm && run(() => deleteCategoryAction(confirm.row.id), close)}
      />
    </div>
  )
}
