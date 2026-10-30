import { describe, expect, it } from 'vitest'
import { safeAdminNext } from '@/lib/auth/redirect'
import { isActiveAdminPath, liveAdminNav } from '@/lib/site/admin-nav'

describe('post-login redirect is internal-only (TC-SEC-051, no open redirect)', () => {
  it.each([
    ['/admin', '/admin'],
    ['/admin/menu', '/admin/menu'],
    ['/admin/menu?page=2', '/admin/menu?page=2'],
  ])('keeps %s', (input, expected) => expect(safeAdminNext(input)).toBe(expected))

  it.each([
    null,
    '',
    'https://evil.example/admin',
    '//evil.example/admin',
    '/\\evil.example',
    '/admin//evil.example',
    '/admin/%2F%2Fevil.example',
    '/adminx',
    '/menu',
    'javascript:alert(1)',
    '/admin/login',
    '/admin/login?next=/admin',
    '/admin\n/evil',
    `/admin/${'a'.repeat(400)}`,
  ])('rejects %j', (input) => expect(safeAdminNext(input)).toBe('/admin'))
})

describe('admin navigation (no dead links)', () => {
  it('lists only modules that exist in this phase', () => {
    expect(liveAdminNav().map((i) => i.href)).toEqual([
      '/admin',
      '/admin/menu',
      '/admin/categories',
      '/admin/offers',
      '/admin/banners',
      '/admin/cafe',
      '/admin/gallery',
      '/admin/feedback',
      '/admin/qr',
      '/admin/recommendations', // Phase R5a
    ])
  })
  it('marks the dashboard exactly and modules by prefix', () => {
    expect(isActiveAdminPath('/admin', '/admin')).toBe(true)
    expect(isActiveAdminPath('/admin/menu', '/admin')).toBe(false)
    expect(isActiveAdminPath('/admin/menu/12', '/admin/menu')).toBe(true)
  })
})
