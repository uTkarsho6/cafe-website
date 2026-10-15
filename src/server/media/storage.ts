import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { EnvValidationError } from '@/lib/config/env'
import { STORAGE_BUCKET } from '@/lib/media'
import { log } from '../log'

/**
 * Supabase Storage writes (ADR-049). Only the server writes, after `requireAdmin()` and image
 * validation; the bucket has no insert/update/delete policies for anon/authenticated users.
 * The secret key is read here only and never reaches the browser.
 */
export type MediaStore = {
  upload(path: string, bytes: Buffer): Promise<void>
  remove(paths: string[]): Promise<void>
}

function supabaseStore(): MediaStore {
  const problems: string[] = []
  let origin: string | undefined
  try {
    origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '').origin
  } catch {}
  const key = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!origin) problems.push('NEXT_PUBLIC_SUPABASE_URL is required for image uploads')
  if (!key) problems.push('SUPABASE_SECRET_KEY is required for image uploads (server only)')
  if (problems.length > 0) throw new EnvValidationError(problems)

  const bucket = createClient(origin!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(STORAGE_BUCKET)

  return {
    async upload(path, bytes) {
      const { error } = await bucket.upload(path, bytes, {
        contentType: 'image/webp',
        cacheControl: '31536000', // paths are unique, so files never change
        upsert: false,
      })
      if (error) {
        log('error', 'storage.upload_failed', { status: error.name })
        throw new Error('storage upload failed')
      }
    },
    async remove(paths) {
      if (paths.length === 0) return
      const { error } = await bucket.remove(paths)
      // A leftover file is harmless (unguessable name, no DB row); log and continue.
      if (error) log('warn', 'storage.remove_failed', { count: paths.length })
    },
  }
}

let store: MediaStore | undefined
export function getMediaStore(): MediaStore {
  store ??= supabaseStore()
  return store
}

/** Tests replace Storage with an in-memory fake. */
export function setMediaStoreForTests(fake: MediaStore | undefined) {
  store = fake
}

/** True when uploads can work (used to show a clear message instead of a failing form). */
export function storageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_SUPABASE_URL)
}
