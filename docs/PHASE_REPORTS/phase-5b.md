# Phase 5B — Menu administration

**Status:** AWAITING TEAM VERIFICATION · Branch `phase-5b` · 2026-10-16

## Requirements addressed
FR-034 categories, FR-035 menu items, FR-036 availability toggle, FR-037 item images (partly, see below), FR-038 add-ons, FR-039 related / bought-together, FR-046 preview link, FR-047 revalidation (menu), FR-045 audit (menu actions).

## What was built
- **Pages** (each calls `requireAdmin()`):
  - `/admin/menu`: search, category and status filters, pagination, availability switch per row.
  - `/admin/menu/new`
  - `/admin/menu/[id]`: details, images, add-ons, linked items, archive / restore / delete.
  - `/admin/categories`: add, edit dialog, archive / restore / delete.
- **Sidebar:** "Menu items" and "Categories" are now live.
- **Server Actions** (`src/features/admin/menu-actions.ts`): `requireAdmin` → Zod → service → audit → cache expiry (ADR-049).
- **Service** `src/server/services/admin-menu.ts`:
  - Transactions for add-ons, relations and images.
  - Delete guards: archive first; never delete an item that is in an offer; never delete a category that still has items.
- **Images** (`src/server/media/`):
  - Validation: magic bytes, 5 MB, 200–6000 px.
  - Re-encoded to WebP with sharp, which strips EXIF/GPS.
  - Stored under a generated UUID path in Supabase Storage. Server writes only, with the secret key.
  - At most 4 per item. Replace, reorder and remove are supported.
- **Freshness:** `updateTag` plus `revalidatePath('/', 'layout')`. Measured: the public page changes within the 10 s test budget with a warm cache. Requirement: ≤30 s.

## Decisions
ADR-049. In short:
- Slugs are generated and never change, so links and QR codes stay valid. This differs from the PRD, where slugs were editable.
- Unknown form fields are dropped, not rejected.
- `refresh()` must not be used after `updateTag`.
- `sharp` 0.35.5 is pinned as a dependency.

## Bugs found and fixed during self-verification
1. **Cached pages stayed stale.** Public item pages kept the old data until the 30 s window ran out, because `updateTag` alone did not expire the page shell. Fixed with `revalidatePath`; the E2E check now warms the cache first.
2. **Delete showed a false error.** Deleting an item when no Storage key is configured deleted the row, then showed "Something went wrong". Fixed: file cleanup is best-effort. Regression test in TC-UNIT-091.
3. **Mobile sideways scroll.** The menu list scrolled sideways at 375 px (an absolutely positioned screen-reader-only header escaped its scroll box) and at 768 px (filter row too wide). Fixed.
4. **Limits matched to the database.** The app limits now match the existing CHECK constraints: price must be above 0, and at most 4 images per item.
5. **Security: credential exposure.** While debugging, a Playwright trace showed the E2E admin account's email and password in this session's output. Traces are git-ignored and the extracted copy was deleted. Traces are now **off** for all admin specs. **Team action: change the E2E admin test account's password in Supabase and update `.env.local`.**

## Commands run and results
| Check | Result |
|---|---|
| `npm run check` (lint, typecheck, format, unit, build) | PASS: 210 unit/component tests |
| `npm run test:integration` | PASS: 92 (12 new in `admin-menu.test.ts`) |
| `npm run test:e2e -- --workers=2` (Chromium + WebKit) | PASS: 249 passed, 0 failed, 21 skipped |
| Visual baselines | New `admin-menu` desktop + mobile; admin dashboard desktop re-recorded (sidebar has 2 new links). Reviewed by eye. |
| axe (serious/critical) on `/admin/menu`, the item editor, `/admin/categories` | PASS: 0 violations |
| No sideways scroll at 375 / 768 / 1440 px | PASS |

**NOT RUN:** real image upload to Supabase Storage (TC-E2E-070 upload step, TC-SEC-060 in the browser). `SUPABASE_SECRET_KEY` is not set and the `public-media` bucket has not been created. Validation itself is covered by the unit tests (disguised, SVG, GIF, corrupt, oversized, too small/large, EXIF stripped).

Skipped by design: Chromium-only screenshot tests in WebKit, and the upload test (above).

## Security checks
- Every action requires an admin. The unit test enumerates all exports, so a new action without the check fails the suite.
- Forged IDs and booleans from the client are rejected before any write.
- Image removal is scoped to its item (IDOR test).
- XSS text in names is stored as text and escaped on render.
- No secret reaches the client: the Storage key is read only in `server-only` code.

## HOW TO TEST THIS PHASE
1. **Optional, for uploads:** create the Storage bucket and add `SUPABASE_SECRET_KEY` to `.env.local` (DEPLOYMENT.md §7, steps 1–3).
2. `git switch phase-5b && npm ci && npm run dev`, then sign in at http://localhost:3000/admin/login.
3. **Change a price and availability.**
   - Open **Menu items**, open any item, change the price, and click **Save changes**.
   - Open `/menu/<slug>` in another tab: the new price shows.
   - Back in the list, turn the **Available** switch off: the public page shows "Out of stock".
4. **Upload an image** (needs step 1). Item editor → **Images** → choose a JPEG/PNG → **Upload image**: it appears on the public item page. A renamed text file is refused.
5. **Archive an item.** **Archive item** → confirm: it disappears from `/menu`. **Restore item** brings it back.
6. **Categories.** Add a category, archive it, then delete it. A category that still has items cannot be deleted.
7. Automated checks: `npm run check && npm run test:integration && npm run test:e2e -- --workers=2`.

**Not bugs:**
- The upload form says uploads are off until step 1 is done.
- Slugs do not change when an item is renamed (on purpose).
- Offers, banners, café info and gallery admin arrive in Phase 5C.

**If something fails:** send the command output, a screenshot, and any browser console error.

Phase 5B complete. Waiting for your approval or bug reports before starting Phase 5C. To approve, reply exactly: approved, go to Phase 5C
