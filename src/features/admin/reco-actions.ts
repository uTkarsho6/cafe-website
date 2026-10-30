'use server'

import { z } from 'zod'
import { fieldErrors } from '@/lib/validation/admin-menu'
import { recoWeightsSchema } from '@/lib/validation/reco'
import { requireAdmin } from '@/server/auth/admin'
import { recordAudit } from '@/server/audit'
import { getDb } from '@/server/db'
import { TAGS } from '@/server/public-data'
import { activateRun, trainAndActivate } from '@/server/reco/train'
import { expirePublic, fail, guarded, ok, parseId, type FormState } from './action-utils'

/**
 * Recommendation administration (FR-067, Phase R5). Same rules as every admin action (ADR-049):
 * `requireAdmin()` first, Zod on every argument, an audit entry, then the public `reco` cache is
 * expired so customers see the change on their next request.
 */

const PAGE = '/admin/recommendations'
const audit = (adminUserId: string, entityId: string, summary: string) =>
  recordAudit({ adminUserId, action: 'UPDATE', entityType: 'recommendations', entityId, summary })

export async function setRecoEnabledAction(enabled: boolean): Promise<FormState> {
  const admin = await requireAdmin(PAGE)
  const value = z.boolean().safeParse(enabled)
  if (!value.success) return fail('Invalid request.')
  return guarded('reco.enable', async () => {
    await getDb().recoSettings.upsert({
      where: { id: 'reco' },
      create: { id: 'reco', enabled: value.data },
      update: { enabled: value.data },
    })
    await audit(admin.id, 'reco', `Recommendations ${value.data ? 'switched on' : 'switched off'}`)
    expirePublic(TAGS.reco)
    return ok(
      value.data
        ? 'Recommendations are now shown on the website.'
        : 'Recommendations switched off: item pages show café picks only.',
    )
  })
}

export async function retrainAction(): Promise<FormState> {
  const admin = await requireAdmin(PAGE)
  return guarded('reco.retrain', async () => {
    const result = await trainAndActivate(getDb(), { startedById: admin.id })
    if (result.status === 'QUEUED')
      return ok('A training run is already in progress; yours will run right after it.')
    await audit(admin.id, 'reco', `Retrained: version ${result.version} ${result.status}`)
    expirePublic(TAGS.reco)
    if (result.status === 'ACTIVE') return ok(`Version ${result.version} trained and activated.`)
    if (result.status === 'REJECTED')
      return fail(
        `Version ${result.version} was not activated: ${result.reason ?? 'it scored below the current version'}.`,
      )
    return fail(`Version ${result.version} failed to train. The current version stays active.`)
  })
}

export async function saveRecoWeightsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin(PAGE)
  const parsed = recoWeightsSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return fail('Please fix the highlighted fields.', fieldErrors(parsed.error))
  return guarded('reco.weights', async () => {
    await getDb().recoSettings.upsert({
      where: { id: 'reco' },
      create: { id: 'reco', ...parsed.data },
      update: parsed.data,
    })
    const w = parsed.data
    await audit(
      admin.id,
      'reco',
      `Weights set: goes-well-with ${w.compCoocPm}/${w.compQualityPm}/${w.compContentPm}, ` +
        `you-may-also-like ${w.simContentPm}/${w.simTastePm}/${w.simQualityPm}`,
    )
    return ok('Weights saved. They apply from the next training run ("Retrain now").')
  })
}

export async function activateRunAction(runId: string): Promise<FormState> {
  const admin = await requireAdmin(PAGE)
  const id = parseId(runId)
  if (!id.success) return fail('Invalid request.')
  return guarded('reco.activate', async () => {
    const run = await getDb().recoModelRun.findUnique({
      where: { id: id.data },
      select: { version: true, status: true },
    })
    if (!run || (run.status !== 'ACTIVE' && run.status !== 'ARCHIVED'))
      return fail('Only a stored (active or archived) version can be activated.')
    await activateRun(getDb(), id.data)
    await audit(admin.id, id.data, `Activated version ${run.version}`)
    expirePublic(TAGS.reco)
    return ok(`Version ${run.version} is now active.`)
  })
}
