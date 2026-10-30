// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recoWeightsSchema } from '@/lib/validation/reco'
import { itemInputSchema, categoryInputSchema } from '@/lib/validation/admin-menu'

/**
 * Phase R5a: admin recommendation actions and inputs.
 * TC-SEC-133: every action calls requireAdmin() first; refused callers change nothing.
 * TC-SEC-134: mass assignment on weights/activate is dropped or refused.
 */
const requireAdmin = vi.fn()
vi.mock('@/server/auth/admin', () => ({ requireAdmin: (...a: unknown[]) => requireAdmin(...a) }))
vi.mock('next/cache', () => ({ updateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/server/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/server/media/storage', () => ({ getMediaStore: vi.fn() }))
const upsert = vi.fn()
const findUnique = vi.fn()
vi.mock('@/server/db', () => ({
  getDb: () => ({ recoSettings: { upsert }, recoModelRun: { findUnique } }),
}))
const trainAndActivate = vi.fn()
const activateRun = vi.fn()
vi.mock('@/server/reco/train', () => ({
  trainAndActivate: (...a: unknown[]) => trainAndActivate(...a),
  activateRun: (...a: unknown[]) => activateRun(...a),
}))

const actions = await import('@/features/admin/reco-actions')
const prev = { ok: false, message: null, errors: {} }
const ID = 'cmf0000000000000000000001'
const weightsForm = (extra: Record<string, string> = {}) => {
  const f = new FormData()
  const w = {
    compCoocPm: '500',
    compQualityPm: '0',
    compContentPm: '500',
    simContentPm: '500',
    simTastePm: '200',
    simQualityPm: '300',
    ...extra,
  }
  for (const [k, v] of Object.entries(w)) f.set(k, v)
  return f
}

beforeEach(() => vi.clearAllMocks())

describe('authorization (TC-SEC-133)', () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ['setRecoEnabledAction', () => actions.setRecoEnabledAction(true)],
    ['retrainAction', () => actions.retrainAction()],
    ['saveRecoWeightsAction', () => actions.saveRecoWeightsAction(prev, weightsForm())],
    ['activateRunAction', () => actions.activateRunAction(ID)],
  ]
  it.each(calls)('%s refuses when requireAdmin refuses, before any change', async (_n, call) => {
    requireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(call()).rejects.toThrow('NEXT_REDIRECT')
    expect(upsert).not.toHaveBeenCalled()
    expect(trainAndActivate).not.toHaveBeenCalled()
    expect(activateRun).not.toHaveBeenCalled()
  })
})

describe('inputs (TC-SEC-134)', () => {
  beforeEach(() => requireAdmin.mockResolvedValue({ id: 'admin1' }))

  it('weights: unknown fields (enabled, activeRunId, status, dataSource) are never written', async () => {
    const r = await actions.saveRecoWeightsAction(
      prev,
      weightsForm({ enabled: 'true', activeRunId: ID, status: 'ACTIVE', dataSource: 'REAL' }),
    )
    expect(r.ok).toBe(true)
    const { create, update } = upsert.mock.calls[0][0]
    expect(Object.keys(update).sort()).toEqual([
      'compContentPm',
      'compCoocPm',
      'compQualityPm',
      'simContentPm',
      'simQualityPm',
      'simTastePm',
    ])
    expect(create).not.toHaveProperty('enabled')
    expect(create).not.toHaveProperty('activeRunId')
  })

  it('weights: out-of-range, non-integer and all-zero lists are refused with field errors', async () => {
    for (const [extra, field] of [
      [{ compCoocPm: '1001' }, 'compCoocPm'],
      [{ simTastePm: '-1' }, 'simTastePm'],
      [{ simQualityPm: '2.5' }, 'simQualityPm'],
      [{ compCoocPm: 'abc' }, 'compCoocPm'],
      [{ compCoocPm: '0', compContentPm: '0' }, 'compCoocPm'],
      [{ simContentPm: '0', simTastePm: '0', simQualityPm: '0' }, 'simContentPm'],
    ] as const) {
      const r = await actions.saveRecoWeightsAction(prev, weightsForm(extra))
      expect(r.ok, JSON.stringify(extra)).toBe(false)
      expect(r.errors[field], JSON.stringify(extra)).toBeTruthy()
    }
    expect(upsert).not.toHaveBeenCalled()
  })

  it('activate: invalid IDs and unknown, rejected or failed runs are refused', async () => {
    expect((await actions.activateRunAction("1' OR 1=1 --")).ok).toBe(false)
    findUnique.mockResolvedValueOnce(null)
    expect((await actions.activateRunAction(ID)).ok).toBe(false)
    for (const status of ['REJECTED', 'FAILED', 'TRAINING']) {
      findUnique.mockResolvedValueOnce({ version: 3, status })
      expect((await actions.activateRunAction(ID)).ok).toBe(false)
    }
    expect(activateRun).not.toHaveBeenCalled()
    findUnique.mockResolvedValueOnce({ version: 2, status: 'ARCHIVED' })
    const r = await actions.activateRunAction(ID)
    expect(r).toMatchObject({ ok: true, message: 'Version 2 is now active.' })
    expect(activateRun).toHaveBeenCalledOnce()
  })

  it('switch: only a real boolean is accepted', async () => {
    expect((await actions.setRecoEnabledAction('yes' as unknown as boolean)).ok).toBe(false)
    expect(upsert).not.toHaveBeenCalled()
    expect((await actions.setRecoEnabledAction(false)).ok).toBe(true)
    expect(upsert.mock.calls[0][0].update).toEqual({ enabled: false })
  })

  it('retrain: reports queued, activated and rejected runs honestly', async () => {
    trainAndActivate.mockResolvedValueOnce({ status: 'QUEUED' })
    expect((await actions.retrainAction()).message).toMatch(/already in progress/)
    trainAndActivate.mockResolvedValueOnce({
      status: 'ACTIVE',
      version: 4,
      runId: ID,
      reason: null,
      metrics: null,
    })
    expect(await actions.retrainAction()).toMatchObject({
      ok: true,
      message: 'Version 4 trained and activated.',
    })
    trainAndActivate.mockResolvedValueOnce({
      status: 'REJECTED',
      version: 5,
      runId: ID,
      reason: 'worse',
      metrics: null,
    })
    expect(await actions.retrainAction()).toMatchObject({ ok: false })
    expect(trainAndActivate.mock.calls[0][1]).toEqual({ startedById: 'admin1' })
  })
})

describe('editor schemas (Phase R5a)', () => {
  const item = {
    name: 'Wrap',
    description: 'A tasty demo wrap',
    price: '149',
    categoryId: ID,
    dietType: 'VEG',
    sortOrder: '0',
  }
  it('item flavour tags: known keys only, canonical order, at most 5, missing = none', () => {
    expect(itemInputSchema.parse(item).flavorTags).toEqual([])
    expect(itemInputSchema.parse({ ...item, flavorTags: ['CHEESY', 'SPICY'] }).flavorTags).toEqual([
      'SPICY',
      'CHEESY',
    ])
    expect(itemInputSchema.safeParse({ ...item, flavorTags: ['HOT_DOG'] }).success).toBe(false)
    expect(
      itemInputSchema.safeParse({
        ...item,
        flavorTags: ['SPICY', 'CHEESY', 'KOREAN', 'ITALIAN', 'PANEER', 'MINTY'],
      }).success,
    ).toBe(false)
  })
  it('category meal role: fixed list, default MAIN', () => {
    const cat = { name: 'Drinks', iconKey: 'GENERAL', sortOrder: '0' }
    expect(categoryInputSchema.parse(cat).mealRole).toBe('MAIN')
    expect(categoryInputSchema.parse({ ...cat, mealRole: 'DRINK' }).mealRole).toBe('DRINK')
    expect(categoryInputSchema.safeParse({ ...cat, mealRole: 'SNACKS' }).success).toBe(false)
  })
  it('weights schema accepts the tuned defaults', () => {
    expect(
      recoWeightsSchema.parse({
        compCoocPm: 500,
        compQualityPm: 0,
        compContentPm: 500,
        simContentPm: 500,
        simTastePm: 200,
        simQualityPm: 300,
      }),
    ).toBeTruthy()
  })
})
