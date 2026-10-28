import { z } from 'zod'

/**
 * Table QR cards (Round 2C, ADR-061). Each table's code opens the same public menu with
 * `table=N` added. The number is informational only: it is not stored, tracked or used for
 * ordering (out of scope, CLAUDE.md §3.0). Shared by the API route and the admin page.
 */
export const TABLE_COUNT = 20
export const TABLE_NUMBERS = Array.from({ length: TABLE_COUNT }, (_, i) => i + 1)

/** Whole numbers 1–TABLE_COUNT only ("05", "1.5", "-1", "1e1" are refused). */
export const tableNumberSchema = z
  .string()
  .regex(/^[1-9]\d?$/, `Table must be a whole number from 1 to ${TABLE_COUNT}.`)
  .transform(Number)
  .refine((n) => n <= TABLE_COUNT, `Table must be a whole number from 1 to ${TABLE_COUNT}.`)

/** API path for one table's code; `download` makes the browser save it as a file. */
export function tableQrSrc(table: number, format: 'svg' | 'png', download = false): string {
  return `/api/v1/qr?format=${format}&table=${table}${download ? '&download=1' : ''}`
}
