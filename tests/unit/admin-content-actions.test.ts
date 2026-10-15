// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Phase 5C authorization (TC-SEC-001/031): every offers/banners/café/gallery Server Action calls
 * requireAdmin() before reading input or writing anything.
 */
const requireAdmin = vi.fn()
vi.mock('@/server/auth/admin', () => ({ requireAdmin: (...a: unknown[]) => requireAdmin(...a) }))
vi.mock('next/cache', () => ({ updateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/server/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/server/media/storage', () => ({ getMediaStore: vi.fn() }))
vi.mock('@/server/media/image-upload', () => ({
  UploadRejected: class extends Error {},
  processImageUpload: vi.fn(),
  mediaPath: vi.fn(),
}))
vi.mock('@/server/services/admin-content', () => {
  const fns = [
    'createOffer',
    'updateOffer',
    'setOfferExpired',
    'deleteOffer',
    'createBanner',
    'updateBanner',
    'deleteBanner',
    'saveCafe',
    'saveHours',
    'addGalleryImage',
    'updateGalleryImage',
    'moveGalleryImage',
    'deleteGalleryImage',
  ]
  return Object.fromEntries(fns.map((f) => [f, vi.fn()]))
})

const actions = await import('@/features/admin/content-actions')
const services = await import('@/server/services/admin-content')
const storage = await import('@/server/media/storage')

const ID = 'cmf0000000000000000000001'
const prev = { ok: false, message: null, errors: {} }
const form = () => new FormData()

const calls: Array<[string, () => Promise<unknown>]> = [
  ['saveOfferAction', () => actions.saveOfferAction(prev, form())],
  ['setOfferExpiredAction', () => actions.setOfferExpiredAction(ID, true)],
  ['deleteOfferAction', () => actions.deleteOfferAction(ID)],
  ['saveBannerAction', () => actions.saveBannerAction(prev, form())],
  ['deleteBannerAction', () => actions.deleteBannerAction(ID)],
  ['saveCafeAction', () => actions.saveCafeAction(prev, form())],
  ['saveHoursAction', () => actions.saveHoursAction(prev, form())],
  ['uploadGalleryImageAction', () => actions.uploadGalleryImageAction(prev, form())],
  ['updateGalleryImageAction', () => actions.updateGalleryImageAction(ID, prev, form())],
  ['moveGalleryImageAction', () => actions.moveGalleryImageAction(ID, 1)],
  ['deleteGalleryImageAction', () => actions.deleteGalleryImageAction(ID)],
]

beforeEach(() => vi.clearAllMocks())
const ADMIN = { id: 'admin', email: 'a@test.invalid', displayName: null }

describe('content actions require an admin', () => {
  it('covers every exported action', () => {
    const exported = Object.keys(actions).filter((k) => k.endsWith('Action'))
    expect(exported.sort()).toEqual(calls.map(([n]) => n).sort())
  })

  it.each(calls)('%s refuses without an admin and writes nothing', async (_n, call) => {
    requireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(call()).rejects.toThrow('NEXT_REDIRECT')
    for (const fn of Object.values(services))
      if (vi.isMockFunction(fn)) expect(fn).not.toHaveBeenCalled()
  })

  it('rejects forged IDs and values from the client before any write', async () => {
    requireAdmin.mockResolvedValue(ADMIN)
    expect((await actions.setOfferExpiredAction('../x', true)).ok).toBe(false)
    expect((await actions.moveGalleryImageAction(ID, 5)).ok).toBe(false)
    // @ts-expect-error a non-boolean from a tampered client
    expect((await actions.setOfferExpiredAction(ID, 'yes')).ok).toBe(false)
    expect(services.setOfferExpired).not.toHaveBeenCalled()
    expect(services.moveGalleryImage).not.toHaveBeenCalled()
  })

  it('a banner with a javascript: link is refused before any upload or write', async () => {
    requireAdmin.mockResolvedValue(ADMIN)
    const f = new FormData()
    f.set('title', 'Evil banner')
    f.set('altText', 'An image description')
    f.set('ctaLabel', 'Click')
    f.set('ctaHref', 'javascript:alert(document.cookie)')
    f.set('file', new File([new Uint8Array(10)], 'x.png'))
    const r = await actions.saveBannerAction(prev, f)
    expect(r.ok).toBe(false)
    expect(r.errors.ctaHref).toMatch(/https/)
    expect(storage.getMediaStore).not.toHaveBeenCalled()
    expect(services.createBanner).not.toHaveBeenCalled()
  })

  it('deleting an offer still succeeds when Storage cleanup fails', async () => {
    requireAdmin.mockResolvedValue(ADMIN)
    vi.mocked(services.deleteOffer).mockResolvedValue({
      slug: 'x',
      title: 'X',
      imagePath: 'offers/00000000-0000-4000-8000-000000000001.webp',
    })
    vi.mocked(storage.getMediaStore).mockImplementation(() => {
      throw new Error('SUPABASE_SECRET_KEY is required')
    })
    const r = await actions.deleteOfferAction(ID)
    expect(r).toMatchObject({ ok: true, redirectTo: '/admin/offers?deleted=1' })
  })
})
