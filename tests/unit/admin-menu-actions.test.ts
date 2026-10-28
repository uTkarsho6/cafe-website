// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * TC-SEC-001/031 for Phase 5B: every menu Server Action calls requireAdmin() before touching any
 * input or the database. requireAdmin is mocked to refuse (as it does for anonymous and
 * non-allowlisted users, which redirect); no service function may run.
 */
const requireAdmin = vi.fn()
vi.mock('@/server/auth/admin', () => ({ requireAdmin: (...a: unknown[]) => requireAdmin(...a) }))
vi.mock('next/cache', () => ({ updateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/server/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/server/media/storage', () => ({ getMediaStore: vi.fn() }))
vi.mock('@/server/services/admin-menu', () => {
  class AdminRuleError extends Error {}
  const fns = [
    'createItem',
    'updateItem',
    'setItemAvailability',
    'setItemPrice',
    'setItemFlag',
    'setItemArchived',
    'deleteItem',
    'replaceAddOns',
    'replaceRelations',
    'addItemImage',
    'updateItemImageAlt',
    'removeItemImage',
    'moveItemImage',
    'createCategory',
    'updateCategory',
    'setCategoryArchived',
    'deleteCategory',
  ]
  return { AdminRuleError, ...Object.fromEntries(fns.map((f) => [f, vi.fn()])) }
})

const actions = await import('@/features/admin/menu-actions')
const storage = await import('@/server/media/storage')
const services = await import('@/server/services/admin-menu')

const ID = 'cmf0000000000000000000001'
const form = () => {
  const f = new FormData()
  f.set('name', 'Wrap')
  return f
}
const prev = { ok: false, message: null, errors: {} }

const calls: Array<[string, () => Promise<unknown>]> = [
  ['saveItemAction', () => actions.saveItemAction(prev, form())],
  ['setAvailabilityAction', () => actions.setAvailabilityAction(ID, false)],
  ['setPriceAction', () => actions.setPriceAction(ID, '149')],
  ['setItemFlagAction', () => actions.setItemFlagAction(ID, 'isTrending', true)],
  ['setItemArchivedAction', () => actions.setItemArchivedAction(ID, true)],
  ['deleteItemAction', () => actions.deleteItemAction(ID)],
  ['saveAddOnsAction', () => actions.saveAddOnsAction(ID, prev, form())],
  ['saveRelationsAction', () => actions.saveRelationsAction(ID, prev, form())],
  ['uploadItemImageAction', () => actions.uploadItemImageAction(ID, prev, form())],
  ['updateImageAltAction', () => actions.updateImageAltAction(ID, ID, 'A photo')],
  ['removeItemImageAction', () => actions.removeItemImageAction(ID, ID)],
  ['moveItemImageAction', () => actions.moveItemImageAction(ID, ID, 1)],
  ['saveCategoryAction', () => actions.saveCategoryAction(prev, form())],
  ['setCategoryArchivedAction', () => actions.setCategoryArchivedAction(ID, true)],
  ['deleteCategoryAction', () => actions.deleteCategoryAction(ID)],
]

beforeEach(() => vi.clearAllMocks())

describe('menu actions require an admin (authorization on every action)', () => {
  it('covers every exported action', () => {
    const exported = Object.keys(actions).filter((k) => k.endsWith('Action'))
    expect(exported.sort()).toEqual(calls.map(([n]) => n).sort())
  })

  it.each(calls)('%s refuses without an admin and writes nothing', async (_name, call) => {
    requireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(call()).rejects.toThrow('NEXT_REDIRECT')
    expect(requireAdmin).toHaveBeenCalledTimes(1)
    for (const fn of Object.values(services))
      if (vi.isMockFunction(fn)) expect(fn).not.toHaveBeenCalled()
  })

  it('rejects forged IDs from the client before any write, even for an admin', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin', email: 'a@test.invalid', displayName: null })
    expect((await actions.setAvailabilityAction("x' OR 1=1", true)).ok).toBe(false)
    expect((await actions.deleteItemAction('../../etc')).ok).toBe(false)
    // @ts-expect-error a non-boolean from a tampered client
    expect((await actions.setAvailabilityAction(ID, 'yes')).ok).toBe(false)
    expect(services.setItemAvailability).not.toHaveBeenCalled()
    expect(services.deleteItem).not.toHaveBeenCalled()
  })

  it('quick edits (Round 2C) reject bad prices, unknown flags and forged IDs before any write', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin', email: 'a@test.invalid', displayName: null })
    for (const bad of ['0', '-5', 'abc', '149.555', '1e3', '99999999', ''])
      expect((await actions.setPriceAction(ID, bad)).ok, bad).toBe(false)
    expect((await actions.setPriceAction('../x', '149')).ok).toBe(false)
    for (const flag of ['isArchived', 'isDemo', 'isAvailable', 'pricePaise', '__proto__'])
      expect((await actions.setItemFlagAction(ID, flag, true)).ok, flag).toBe(false)
    // @ts-expect-error a non-boolean from a tampered client
    expect((await actions.setItemFlagAction(ID, 'isTrending', 'yes')).ok).toBe(false)
    expect(services.setItemPrice).not.toHaveBeenCalled()
    expect(services.setItemFlag).not.toHaveBeenCalled()
  })

  it('a valid price is converted to integer paise on the server', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin', email: 'a@test.invalid', displayName: null })
    vi.mocked(services.setItemPrice).mockResolvedValue({ slug: 'wrap', name: 'Wrap' })
    const r = await actions.setPriceAction(ID, ' 149.50 ')
    expect(r.ok).toBe(true)
    expect(services.setItemPrice).toHaveBeenCalledWith(ID, 14950)
    expect(r.message).toBe('"Wrap" now costs ₹149.50.')
  })

  it('regression: delete still succeeds when Storage cleanup fails (no key configured)', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin', email: 'a@test.invalid', displayName: null })
    vi.mocked(services.deleteItem).mockResolvedValue({
      slug: 'x',
      name: 'X',
      paths: [`items/${ID}/00000000-0000-4000-8000-000000000001.webp`],
    })
    vi.mocked(storage.getMediaStore).mockImplementation(() => {
      throw new Error('SUPABASE_SECRET_KEY is required')
    })
    const r = await actions.deleteItemAction(ID)
    expect(r).toMatchObject({ ok: true, redirectTo: '/admin/menu?deleted=1' })
  })
})
