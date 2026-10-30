import 'server-only'
import { after } from 'next/server'
import { getDb } from '../db'
import { log } from '../log'
import { trainAndActivate } from './train'

/**
 * Automatic retrain after a menu-structure change (FR-068, Phase R5).
 * - Runs after the admin's response is sent (`after()`), so saving never waits for training.
 * - Only once the recommender is set up (an active run exists); before that, training is a
 *   deliberate step (`npm run reco:train` or "Retrain now").
 * - Concurrent triggers are coalesced by the training lock (one queued re-run, never a pile-up).
 * - Price and availability changes do not call this: they are applied at read time.
 * The new lists reach customers within the 30 s cache window.
 */
export function scheduleRetrain(adminUserId: string) {
  after(async () => {
    const db = getDb()
    try {
      const settings = await db.recoSettings.findUnique({
        where: { id: 'reco' },
        select: { activeRunId: true },
      })
      if (!settings?.activeRunId) return
      const result = await trainAndActivate(db, { startedById: adminUserId })
      log('info', 'reco.auto_retrain', { status: result.status })
    } catch {
      log('error', 'reco.auto_retrain_failed', {})
    }
  })
}
