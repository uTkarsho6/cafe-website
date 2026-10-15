// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  IDLE_TIMEOUT_MS,
  MAX_SESSION_MS,
  checkActivity,
  encodeActivity,
  sessionIdFromAccessToken,
  sessionOnly,
} from '@/server/auth/activity'

/** Admin idle / maximum session time and session-only cookies (TC-SEC-010, ADR-052). */
const SECRET = 'unit-test-salt-not-a-secret-000000000000'
const SID = '4f1c2a9e-5b6d-4c7e-8f90-123456789abc'
const T0 = 1_800_000_000_000

describe('activity cookie', () => {
  it('valid while active; refreshed activity extends the idle window', () => {
    const v = encodeActivity(SID, T0, T0, SECRET)
    expect(checkActivity(v, SID, SECRET, T0 + IDLE_TIMEOUT_MS - 1).result).toBe('ok')
    const later = encodeActivity(SID, T0, T0 + 25 * 60_000, SECRET)
    expect(checkActivity(later, SID, SECRET, T0 + 50 * 60_000).result).toBe('ok')
  })
  it('expires after 30 minutes idle and 12 hours in total', () => {
    expect(
      checkActivity(encodeActivity(SID, T0, T0, SECRET), SID, SECRET, T0 + IDLE_TIMEOUT_MS + 1)
        .result,
    ).toBe('idle')
    const active = encodeActivity(SID, T0, T0 + MAX_SESSION_MS, SECRET)
    expect(checkActivity(active, SID, SECRET, T0 + MAX_SESSION_MS + 1).result).toBe('max')
  })
  it('rejects missing, tampered, foreign-session, wrong-key and future-dated cookies', () => {
    const v = encodeActivity(SID, T0, T0, SECRET)
    expect(checkActivity(undefined, SID, SECRET, T0).result).toBe('missing')
    // Extending the timestamp without the key breaks the signature.
    const [sid, iat, , mac] = v.split('.')
    expect(checkActivity(`${sid}.${iat}.${T0 + 3_600_000}.${mac}`, SID, SECRET, T0).result).toBe(
      'invalid',
    )
    expect(checkActivity(v, 'another-session-id', SECRET, T0).result).toBe('invalid')
    expect(checkActivity(v, SID, 'a-different-secret-value-000000000000000', T0).result).toBe(
      'invalid',
    )
    expect(
      checkActivity(encodeActivity(SID, T0, T0 + 3_600_000, SECRET), SID, SECRET, T0).result,
    ).toBe('invalid')
    expect(checkActivity('garbage', SID, SECRET, T0).result).toBe('invalid')
    expect(checkActivity(v, undefined, SECRET, T0).result).toBe('invalid')
  })
})

describe('session-only cookies', () => {
  it('drops Max-Age / Expires so the browser deletes the cookie when it closes', () => {
    const opts = sessionOnly({
      path: '/',
      httpOnly: true,
      maxAge: 34_560_000,
      expires: new Date(T0 * 2),
    })
    expect(opts).toEqual({ path: '/', httpOnly: true })
  })
  it('keeps deletions intact so sign-out still clears cookies', () => {
    expect(sessionOnly({ path: '/', maxAge: 0 })).toEqual({ path: '/', maxAge: 0 })
    const past = new Date(0)
    expect(sessionOnly({ path: '/', expires: past })).toEqual({ path: '/', expires: past })
    expect(sessionOnly(undefined)).toBeUndefined()
  })
})

describe('session id from the access token', () => {
  it('reads session_id; returns undefined for junk', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'u', session_id: SID })).toString('base64url')
    expect(sessionIdFromAccessToken(`h.${payload}.s`)).toBe(SID)
    expect(sessionIdFromAccessToken('not-a-jwt')).toBeUndefined()
  })
})
