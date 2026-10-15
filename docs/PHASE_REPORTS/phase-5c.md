# Phase 5C — Offers, banners, café information and gallery administration

**Status:** AWAITING TEAM VERIFICATION · Branch `phase-5c` · 2026-10-16

## Requirements addressed
FR-040 offers and combos, FR-041 banners (partly), FR-042 café info and opening hours, FR-043 gallery (partly), FR-045 audit (5C actions), FR-047 freshness (all admin modules).

## What was built
- **Sidebar:** "Offers & combos", "Banners", "Café info" and "Gallery" are now live. Every page calls `requireAdmin()`.
- **Offers** (`/admin/offers`, `/new`, `/[id]`):
  - List with status: draft, scheduled, active, expired.
  - Create and edit: type, price, India-time start/end, published / featured / student flags, included items with quantities, optional image.
  - "Expire now", "Reactivate" and delete, each with a confirmation dialog.
  - Preview link to the public offer page.
- **Banners** (`/admin/banners`, `/new`, `/[id]`):
  - Title, subtitle, button text and link, optional show window, publish, order.
  - Image is required (upload); alt text.
  - Delete with confirmation.
- **Café info** (`/admin/cafe`):
  - Address, contact, WhatsApp, Instagram/Facebook, coordinates, Google Maps place, texts.
  - "Confirmed by the café" checkboxes and the 100% veg flag.
  - Opening hours for all 7 days.
- **Gallery** (`/admin/gallery`): upload with alt text and caption, publish/hide, move earlier/later, remove.
- **Shared helpers:** `src/features/admin/action-utils.ts`, used by the 5B and 5C actions.

## Decisions
ADR-050. In short:
- Data-changing actions no longer end with `redirect()`; they return a URL and the browser navigates.
- Admins type dates in India time.
- Banner links: internal paths or http(s) only.
- Social links must be on the network's own domain.
- A closing time of "00:00" means midnight.

## Found and fixed during self-verification
1. **Create/delete actions redirected server-side.** Next 16.4 passes the pending cache invalidations of a redirecting action to the internal render of the redirect target. These actions (including the 5B item create and delete) now return the target URL instead.
2. **Test timing.** Public-page checks in the E2E tests gave streamed content only 1 ms to appear, which made them flaky. Each check now waits up to 2 s, inside a 15 s retry budget. Measured freshness is about 0.1–0.2 s.
3. **Edge case, documented rather than fixed.** A public page whose render is still being written to the cache at the moment of the save can stay old until its 30 s window ends. That is still within FR-047.

## Commands run and results
| Check | Result |
|---|---|
| `npm run check` (lint, typecheck, format, unit, build) | PASS: 275 unit/component tests |
| `npm run test:integration` | PASS: 99 (7 new in `admin-content.test.ts`) |
| `npm run test:e2e -- --workers=2` (Chromium + WebKit, all projects) | PASS: 262 passed, 0 failed, 24 skipped (Chromium-only baselines in WebKit, and the upload tests: NOT RUN) |
| Visual baselines | New: `admin-offers` desktop + mobile. Reviewed by eye; dates masked because they depend on the seed date. |
| axe (serious/critical) on all 6 new pages | PASS: 0 violations |
| No sideways scroll at 375 / 768 / 1440 px | PASS |

**NOT RUN:** real uploads to Supabase Storage (banner create, gallery upload, offer image), because `SUPABASE_SECRET_KEY` and the `public-media` bucket do not exist yet. The upload validation is covered by unit tests. Banner editing and gallery management were tested with rows that use a bundled image.

## Security checks
- **Authorization:** every action requires an admin; a unit test enumerates all exports. Forged IDs and values are refused before any write.
- **Links:** a banner with a `javascript:` link is refused in the browser test and in the unit test, before any upload. Social links pointing at other hosts are refused.
- **Mass assignment:** `slug`, `isDemo`, `expiredAt` and `id` can never be set from a form.
- **Audit:** every change writes an audit entry (offer create → expire → delete verified in the browser test).

## HOW TO TEST THIS PHASE
1. `git switch phase-5c && npm ci && npm run dev`, then sign in at http://localhost:3000/admin/login.
2. **Offer.**
   - Go to **Offers & combos → New offer**. Choose Combo, enter a title, description and price ₹149, give one item quantity 1, tick **Published**, then **Create offer**.
   - Open `/offers`: the combo appears.
   - Click **Expire now**: it disappears from `/offers`.
3. **Banner** (needs Storage for a new banner). Optional: create the bucket and set `SUPABASE_SECRET_KEY` (DEPLOYMENT.md §7).
   - **Banners → New banner**: upload an image, set button text "View offers" and link `/offers`. It shows on the home page.
   - Try the link `javascript:alert(1)`: it is refused.
4. **Café info.** Change the phone and Monday's hours, then save both forms. `/contact` shows the new phone and hours.
5. **Gallery** (upload needs Storage). Upload a photo with alt text: it appears on `/gallery`. Untick **Published** and save: it disappears.
6. **Automated:** `npm run check && npm run test:integration && npm run test:e2e -- --workers=2`

**Not bugs:**
- Upload forms say "Image uploads are switched off" until Storage is set up.
- Hours past midnight are not supported yet (Q-05).
- The QR page and feedback moderation come in Phase 6.

**If something fails:** send the command output, a screenshot, and any browser console error.

Phase 5C complete. Waiting for your approval or bug reports before starting Phase 6. To approve, reply exactly: approved, go to Phase 6
