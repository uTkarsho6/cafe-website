import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { feedbackInputSchema } from '@/lib/validation/feedback'
import { RULES, hitRateLimit } from '@/server/rate-limit'
import {
  createFeedback,
  deleteFeedback,
  listAdminFeedback,
  moderateFeedback,
  purgeOldRejectedFeedback,
} from '@/server/services/feedback'
import { listApprovedReviews } from '@/server/services/home'
import { db } from './helpers'

/** Phase 6 feedback flow on Postgres (TC-INT-040/041, TC-SEC-040/070). */
let adminId = ''

beforeAll(async () => {
  const admin = await db().adminUser.create({
    data: { authUserId: randomUUID(), email: 'feedback-admin@test.invalid', displayName: 'Mod' },
  })
  adminId = admin.id
})
afterAll(async () => {
  await db().feedback.deleteMany({ where: { message: { startsWith: 'Test ' } } })
  await db().auditLog.deleteMany({})
  await db().adminUser.deleteMany({ where: { email: { endsWith: '@test.invalid' } } })
  await db().rateLimitBucket.deleteMany({})
})

const submit = (message: string, displayName?: string) =>
  createFeedback(feedbackInputSchema.parse({ message, displayName }))

describe('feedback lifecycle', () => {
  it('new feedback is pending and never public until approved; then shown escaped as text', async () => {
    const xss = 'Test <img src=x onerror=alert(1)> loved it'
    const f = await submit(xss, 'Test Asha')
    expect((await db().feedback.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('PENDING')
    expect((await listApprovedReviews(50)).map((r) => r.id)).not.toContain(f.id)

    const pending = await listAdminFeedback('PENDING', 1)
    expect(pending.items.map((i) => i.id)).toContain(f.id)

    await moderateFeedback(f.id, 'APPROVED', adminId)
    const pub = (await listApprovedReviews(50)).find((r) => r.id === f.id)
    expect(pub).toMatchObject({ displayName: 'Test Asha', message: xss }) // stored as text
    const row = await db().feedback.findUniqueOrThrow({ where: { id: f.id } })
    expect(row.moderatedById).toBe(adminId)
    expect(row.moderatedAt).not.toBeNull()

    await moderateFeedback(f.id, 'REJECTED', adminId)
    expect((await listApprovedReviews(50)).map((r) => r.id)).not.toContain(f.id)
    expect((await listAdminFeedback('REJECTED', 1)).items.map((i) => i.id)).toContain(f.id)

    await deleteFeedback(f.id)
    await expect(deleteFeedback(f.id)).rejects.toThrow(/no longer exists/)
    await expect(moderateFeedback(f.id, 'APPROVED', adminId)).rejects.toThrow(/no longer exists/)
  })

  it('quick highlights (TC-INT-043): stored, shown on approved reviews and in moderation; DB refuses unknown tags', async () => {
    const f = await createFeedback(
      feedbackInputSchema.parse({
        message: 'Test highlights were spot on',
        tags: ['QUICK_SERVICE', 'TASTY_FOOD'],
      }),
    )
    expect((await db().feedback.findUniqueOrThrow({ where: { id: f.id } })).tags).toEqual([
      'TASTY_FOOD',
      'QUICK_SERVICE',
    ])
    const row = (await listAdminFeedback('PENDING', 1)).items.find((i) => i.id === f.id)
    expect(row?.tags).toEqual(['TASTY_FOOD', 'QUICK_SERVICE'])
    await moderateFeedback(f.id, 'APPROVED', adminId)
    const pub = (await listApprovedReviews(50)).find((r) => r.id === f.id)
    expect(pub?.tags).toEqual(['TASTY_FOOD', 'QUICK_SERVICE'])

    // Without tags (existing rows, old clients): an empty list, never null.
    const plain = await submit('Test no highlights at all')
    expect((await db().feedback.findUniqueOrThrow({ where: { id: plain.id } })).tags).toEqual([])

    // The enum is the last line of defence: even raw SQL cannot store an unknown tag.
    await expect(
      db().$executeRawUnsafe(
        `UPDATE "Feedback" SET tags = ARRAY['APPROVED']::"FeedbackTag"[] WHERE id = $1`,
        f.id,
      ),
    ).rejects.toThrow()
  })

  it('anonymous feedback shows as "Guest"; counts per status are returned', async () => {
    const f = await submit('Test anonymous feedback')
    await moderateFeedback(f.id, 'APPROVED', adminId)
    expect((await listApprovedReviews(50)).find((r) => r.id === f.id)?.displayName).toBe('Guest')
    const list = await listAdminFeedback('APPROVED', 1)
    expect(list.counts.APPROVED).toBeGreaterThanOrEqual(1)
  })

  it('rate limit: 3 per 10 minutes per IP, 4th refused; other IPs unaffected', async () => {
    const now = new Date('2026-10-16T10:00:00Z')
    const ip = ['198.51.100.77']
    for (let i = 0; i < 3; i++)
      expect((await hitRateLimit(RULES.feedbackPerIp, ip, now)).allowed).toBe(true)
    expect((await hitRateLimit(RULES.feedbackPerIp, ip, now)).allowed).toBe(false)
    expect((await hitRateLimit(RULES.feedbackPerIp, ['198.51.100.78'], now)).allowed).toBe(true)
    const later = new Date(now.getTime() + 10 * 60_000)
    expect((await hitRateLimit(RULES.feedbackPerIp, ip, later)).allowed).toBe(true)
  })

  it('retention: rejected feedback older than 90 days is purged; newer and approved kept', async () => {
    const old = await submit('Test old rejected feedback')
    const recent = await submit('Test recent rejected feedback')
    const approved = await submit('Test old approved feedback')
    const day = 86_400_000
    await db().feedback.update({
      where: { id: old.id },
      data: { status: 'REJECTED', moderatedAt: new Date(Date.now() - 91 * day) },
    })
    await db().feedback.update({
      where: { id: recent.id },
      data: { status: 'REJECTED', moderatedAt: new Date(Date.now() - 89 * day) },
    })
    await db().feedback.update({
      where: { id: approved.id },
      data: { status: 'APPROVED', moderatedAt: new Date(Date.now() - 400 * day) },
    })
    expect(await purgeOldRejectedFeedback()).toBe(1)
    const left = await db().feedback.findMany({
      where: { id: { in: [old.id, recent.id, approved.id] } },
    })
    expect(left.map((f) => f.id).sort()).toEqual([recent.id, approved.id].sort())
  })
})
