# Phase R5a — Recommendation: admin page, editors, automatic retrain

**Status:** AWAITING TEAM VERIFICATION (2026-10-30)
**Branch:** `phase-r5` (from local `main` after the R4 merge). Not pushed; the live site is unchanged.
**Approval that started it:** "approved, go to Phase R5" (2026-10-30). R5 was split into R5a (this) and R5b (production go-live), ADR-076.

## 1. Requirements addressed
| Requirement | Result |
|---|---|
| FR-067 Admin recommendations | **Verified** locally (test database, Chromium) |
| FR-068 Automatic retrain | **Verified** (a flavour-tag edit produced a new version, TC-E2E-098) |
| Flavour-tag and meal-role editing (ADR-069) | **Verified** (persist after reload) |
| Production go-live, live `reco:validate` | R5b |

## 2. What was built
| Part | Files |
|---|---|
| Admin page | `src/app/(admin)/admin/(shell)/recommendations/page.tsx`, with three tabs: **Overview** (summary, on/off switch, Retrain now, weights), **Versions** (last 10 versions, Activate with confirm), **Inspect a dish** (stored lists with score components and whether each row is hidden now) |
| Actions | `src/features/admin/reco-actions.ts`: switch, retrain, weights, activate (admin check, validation, audit, cache expiry) |
| Controls | `src/features/admin/reco/reco-controls.tsx`: switch, retrain button, weights form with live % shares, activate + confirm dialog |
| Read service | `src/server/services/admin-reco.ts` |
| Automatic retrain | `src/server/reco/auto.ts` (`scheduleRetrain`, runs after the response); hooks in `src/features/admin/menu-actions.ts`; `updateItem` reports whether a learned field changed |
| Editors | item form: "Flavour tags" chips (max 5); category form: "Meal role" select; schemas in `src/lib/validation/admin-menu.ts`, `recoWeightsSchema` in `src/lib/validation/reco.ts` |
| Sidebar | "Recommendations" entry (`src/lib/site/admin-nav.ts`) |
| Tests | `tests/unit/reco-admin.test.ts` (TC-SEC-133/134, schemas), `tests/component/reco-admin.test.tsx` (TC-COMP-032), `tests/e2e/admin-reco.spec.ts` (TC-E2E-097/098, axe, widths, visual); new Playwright project `admin-reco-chromium` (runs last, changes shared data) |
| Docs | ADR-076, TRACEABILITY, TEST_PLAN, PROGRESS backlog |

## 3. Decisions (ADR-076)
- **"Retrain now" runs while the admin waits,** so the message tells the real outcome: activated, not activated (with the reason), or queued behind another run.
- **Saving weights does not retrain;** the admin chooses when to retrain.
- **What triggers an automatic retrain:** creating, deleting, archiving or restoring a dish; editing a dish's name, description, category, published flag, best-seller or trending flag, or flavour tags; saving or archiving a category.
- **What never retrains:** price, availability, image and add-on changes. These are applied when pages are read.

## 4. Commands executed and results
| Command | Result |
|---|---|
| `npx vitest run tests/unit` | PASS (26 files, 375). Three older tests were updated for the new fields: the allowed-field lists now include `flavorTags` / `mealRole`, the nav list includes Recommendations, and the menu-action unit test mocks the retrain trigger (`after()` needs a real request) |
| `npx vitest run tests/component/reco-admin.test.tsx` | PASS (3) |
| `npm run check` (lint, typecheck, format, unit + component, build) | PASS (32 files, 417 tests; build OK) |
| `npm run test:integration` | PASS (9 files, 133) |
| `npx playwright test --project=admin-reco-chromium` while building | Found and fixed 3 problems: the 375 px page overflow (real bug), an ambiguous test locator, and a version count that stops growing at 10 (runs are pruned) |
| `npm run test:e2e -- --workers=2` (all projects) | **PASS: 373 passed, 0 failed, 25 skipped** (21 environment-dependent as before + 4 WebKit visual). The new `admin-reco-chromium` project: 7/7 |
| gitleaks: `src`, `tests`, `docs` | PASS (no leaks) |

## 5. Security
- **Admin check first:** every action calls `requireAdmin()` before anything else. TC-SEC-133 confirms that a refused caller changes nothing (no database write, no training, no activation).
- **Mass assignment (TC-SEC-134):** in the weights form, `enabled`, `activeRunId`, `status` and `dataSource` are dropped. Activation refuses invalid IDs, unknown versions and rejected, failed or in-training versions.
- **Admin-only data:** scores and score components appear only on this admin page. The public pages and APIs are unchanged (R3/R4 contract tests still pass).
- **Audit:** every change writes an audit entry with `entityType` "recommendations", checked in TC-E2E-097.

## 6. UI consistency
- Built from existing components and tokens: admin page header, pill tabs (category-pill style), cards, `Switch`, `ConfirmDialog`, the admin table style (scrolls inside its own box), `TextField`.
- **Bug found and fixed:** at 375 px the Versions table widened the whole page to 853 px. The visually-hidden text in the "Activate" buttons escaped the scroll box because the box wasn't positioned. Fixed with `relative`, the same as the category table.
- No horizontal page scroll at 375 / 430 / 768 / 1024 / 1440 px; axe reports 0 serious or critical issues on all three tabs.

## 7. Self-verification
- Ran the admin flow in Chromium against the production build and test database:
  - switch off → item page shows café picks only (2 + 1); switch on → 4 + 4 again;
  - retrain → new version; activate an older version → it becomes active;
  - weights validation and saving;
  - inspect;
  - a tag edit → automatic new version;
  - a meal-role edit saves.
- Reviewed both new baseline screenshots.

## 8. Known issues and limitations
- **Category editor (pre-existing since 5B):** the edit dialog closes on save before its "Category saved." message shows. The save itself works (checked in the database). It's in the backlog.
- **New lists after an automatic retrain** reach customers within the 30-second cache window, not instantly.
- **Admin tests:** they run in Chromium only (one engine is enough: they test server behaviour). They need the E2E admin accounts in `.env.local`, as before.
- **No-JavaScript limitation (R4, ADR-075):** unchanged.
- **Production:** still has none of the recommendation work. That's R5b.

## 9. Next phase: R5b (production go-live, written approval needed)
1. You put the production `DIRECT_URL` in your local env file (never in chat).
2. Production migration: two migrations that only add tables and columns; nothing is deleted.
3. On production: `reco:tags --production` (you review the tags in the admin page), `reco:generate --production` (demo data, separate tables), `reco:train --production` (switch stays off).
4. Push `main` → Vercel deploys.
5. Switch on in the admin page; run `reco:validate`, throttled, against zorko-sangli.vercel.app; check on a phone.
6. **Rollback:** the switch off (instant), or "Promote" the previous deployment in Vercel.

---

## HOW TO TEST THIS PHASE

1. **Checks** (Docker Desktop running, E2E admin accounts in `.env.local` as before):
   ```bash
   cd ~/projects/zorko-sangli && git switch phase-r5 && npm ci
   npm run check
   npm run test:integration
   npm run test:e2e            # includes the new admin-reco project (runs last)
   ```
2. **Try it on your dev database:**
   ```bash
   npm run build && PORT=3100 npm run start
   ```
   Sign in at http://localhost:3100/admin/login, then open **Recommendations** in the sidebar.
3. **Manual checks:**
   - **Overview:** switch off "Show recommendations on the website", then open `/menu/korean-burger` in another tab. Within 30 s only your café picks remain (or the sections disappear if there are none). Switch it back on.
   - **Retrain now:** the message says "Version N trained and activated" (on the remote dev database this can take ~10 s). **Versions:** the new version is active; activate the previous one via the confirm dialog.
   - **Weights:** type 1500 → field error; type 250 → "Weights saved". Set it back to 200.
   - **Inspect a dish:** pick Korean Burger and see both lists with their scores. A dish you mark sold out shows "Sold out" in the "Shown" column.
   - **Menu items → edit a dish:** tick a flavour tag and save. On the Versions tab, a new version appears within a few seconds (automatic retrain). Try ticking a 6th tag: it is refused with a message.
   - **Categories → Edit:** the "Meal role" select is there and saves.
4. **Not bugs:**
   - The category dialog closes without a toast (pre-existing).
   - Public lists update within 30 s after a retrain.
   - Production does not have this yet (R5b).

**If something fails:** send the command and its last 30 lines, or a screenshot plus the browser console errors.
