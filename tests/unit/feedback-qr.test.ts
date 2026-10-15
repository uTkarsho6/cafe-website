// @vitest-environment node
import QRCode from 'qrcode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminFeedbackQuerySchema, feedbackInputSchema } from '@/lib/validation/feedback'
import { qrPng, qrSvg, qrTarget, qrWarnings } from '@/server/qr'

describe('feedback input (TC-UNIT-050)', () => {
  it('accepts a message with an optional name; empty name → null', () => {
    const r = feedbackInputSchema.parse({ message: 'Loved the paneer wrap!', displayName: '  ' })
    expect(r).toEqual({ message: 'Loved the paneer wrap!', displayName: null })
  })
  it('enforces 10–1000 characters and a 40-character name', () => {
    expect(feedbackInputSchema.safeParse({ message: 'too short' }).success).toBe(false)
    expect(feedbackInputSchema.safeParse({ message: 'x'.repeat(1001) }).success).toBe(false)
    expect(
      feedbackInputSchema.safeParse({ message: 'A fine message.', displayName: 'n'.repeat(41) })
        .success,
    ).toBe(false)
  })
  it('strips control, invisible and bidi-override characters; keeps line breaks', () => {
    const r = feedbackInputSchema.parse({
      message: 'Great\u0000 food‮ evil​ text\r\n\r\n\r\nBye',
      displayName: 'Ra‮j',
    })
    expect(r.message).toBe('Great food evil text\n\nBye')
    expect(r.displayName).toBe('Raj')
  })
  it('keeps HTML as plain text (escaped when rendered) and drops unknown fields', () => {
    const r = feedbackInputSchema.parse({
      message: '<script>alert(1)</script> nice',
      status: 'APPROVED',
      isDemo: 'true',
    })
    expect(r.message).toBe('<script>alert(1)</script> nice')
    expect(r).not.toHaveProperty('status')
    expect(r).not.toHaveProperty('isDemo')
  })
  it('admin list query falls back to pending, page 1', () => {
    expect(adminFeedbackQuerySchema.parse({ status: 'hacked', page: '-1' })).toEqual({
      status: 'pending',
      page: 1,
    })
  })
})

describe('QR code (TC-UNIT-030)', () => {
  it('encodes the configured public menu URL, never the request host', () => {
    expect(qrTarget('https://zorko-sangli.example')).toBe(
      'https://zorko-sangli.example/menu?src=qr',
    )
    expect(qrTarget('https://zorko-sangli.example/')).toBe(
      'https://zorko-sangli.example/menu?src=qr',
    )
  })
  it('the generated code contains exactly that URL', () => {
    const target = 'https://zorko-sangli.example/menu?src=qr'
    const code = QRCode.create(target, { errorCorrectionLevel: 'M' })
    const data = code.segments
      .map((s) =>
        typeof s.data === 'string' ? s.data : new TextDecoder().decode(s.data as Uint8Array),
      )
      .join('')
    expect(data).toBe(target)
  })
  it('SVG and PNG outputs are valid images', async () => {
    const svg = await qrSvg('https://zorko-sangli.example/menu?src=qr')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).not.toMatch(/<script|on\w+=/i)
    const png = await qrPng('https://zorko-sangli.example/menu?src=qr')
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })
  it('warns about localhost, LAN and http addresses (TC-E2E-043)', () => {
    expect(qrWarnings('https://zorko-sangli.example')).toEqual([])
    expect(qrWarnings('http://localhost:3000').join(' ')).toMatch(/localhost[\s\S]*not https/)
    expect(qrWarnings('http://192.168.1.20:3000').join(' ')).toMatch(/local network/)
  })
})

// ── Server Actions ───────────────────────────────────────────────────────────

const requireAdmin = vi.fn()
const hitRateLimit = vi.fn()
vi.mock('@/server/auth/admin', () => ({ requireAdmin: (...a: unknown[]) => requireAdmin(...a) }))
vi.mock('next/cache', () => ({ updateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/server/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/server/client-ip', () => ({ clientIp: async () => '203.0.113.9' }))
vi.mock('@/server/rate-limit', () => ({
  RULES: { feedbackPerIp: { scope: 'feedback', limit: 3, windowMs: 600_000 } },
  hitRateLimit: (...a: unknown[]) => hitRateLimit(...a),
}))
vi.mock('@/server/services/feedback', () => ({
  createFeedback: vi.fn(),
  moderateFeedback: vi.fn(),
  deleteFeedback: vi.fn(),
}))

const adminActions = await import('@/features/admin/feedback-actions')
const publicActions = await import('@/features/feedback/actions')
const services = await import('@/server/services/feedback')
const ID = 'cmf0000000000000000000001'
const idle = { status: 'idle' as const, message: null, errors: {} }
const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

beforeEach(() => vi.clearAllMocks())

describe('moderation actions require an admin (TC-SEC-001/002)', () => {
  it('covers every exported action', () => {
    expect(Object.keys(adminActions).sort()).toEqual([
      'deleteFeedbackAction',
      'moderateFeedbackAction',
    ])
  })
  it.each([
    ['approve', () => adminActions.moderateFeedbackAction(ID, 'APPROVED')],
    ['reject', () => adminActions.moderateFeedbackAction(ID, 'REJECTED')],
    ['delete', () => adminActions.deleteFeedbackAction(ID)],
  ])('%s refuses without an admin and writes nothing', async (_n, call) => {
    requireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(call()).rejects.toThrow('NEXT_REDIRECT')
    expect(services.moderateFeedback).not.toHaveBeenCalled()
    expect(services.deleteFeedback).not.toHaveBeenCalled()
  })
  it('rejects a forged status or ID', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin', email: 'a@test.invalid', displayName: null })
    expect((await adminActions.moderateFeedbackAction(ID, 'PENDING')).ok).toBe(false)
    expect((await adminActions.moderateFeedbackAction('../x', 'APPROVED')).ok).toBe(false)
    expect(services.moderateFeedback).not.toHaveBeenCalled()
  })
})

describe('public feedback submission (TC-SEC-070)', () => {
  it('stores valid feedback as pending (no status from the client)', async () => {
    hitRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 0 })
    const r = await publicActions.submitFeedbackAction(
      idle,
      form({ message: 'Great cold coffee!', status: 'APPROVED' }),
    )
    expect(r.status).toBe('success')
    expect(services.createFeedback).toHaveBeenCalledWith({
      displayName: null,
      message: 'Great cold coffee!',
      website: undefined,
    })
  })
  it('honeypot filled: reports success but stores nothing and spends no rate limit', async () => {
    const r = await publicActions.submitFeedbackAction(
      idle,
      form({ message: 'Buy cheap watches now', website: 'http://spam.example' }),
    )
    expect(r.status).toBe('success')
    expect(services.createFeedback).not.toHaveBeenCalled()
    expect(hitRateLimit).not.toHaveBeenCalled()
  })
  it('over the limit: refused with a clear message, nothing stored', async () => {
    hitRateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 300 })
    const r = await publicActions.submitFeedbackAction(
      idle,
      form({ message: 'Fourth message here' }),
    )
    expect(r).toMatchObject({ status: 'error', message: expect.stringMatching(/Too many/) })
    expect(services.createFeedback).not.toHaveBeenCalled()
  })
  it('invalid input: field errors, no rate-limit hit', async () => {
    const r = await publicActions.submitFeedbackAction(idle, form({ message: 'short' }))
    expect(r.errors.message).toMatch(/at least 10/)
    expect(hitRateLimit).not.toHaveBeenCalled()
  })
  it('database failure: generic message, no internals', async () => {
    hitRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 0 })
    vi.mocked(services.createFeedback).mockRejectedValue(
      new Error('relation "Feedback" does not exist'),
    )
    const r = await publicActions.submitFeedbackAction(idle, form({ message: 'A valid message!' }))
    expect(r.message).not.toMatch(/relation|Feedback"/)
    expect(r.status).toBe('error')
  })
})
