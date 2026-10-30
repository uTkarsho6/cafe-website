# Phase R4 — Recommendation: customer-facing UI

**Status:** AWAITING TEAM VERIFICATION (2026-10-30)
**Branch:** `phase-r4` (from local `main` after the R3 merge). Not pushed; the live site is unchanged.
**Approval that started it:** "approved, go to Phase R4" (2026-10-30).

## 1. Requirements addressed
| Requirement | Result in R4 |
|---|---|
| FR-063 Goes well with | **Verified** (item page, TC-COMP-030, TC-E2E-093/094) |
| FR-064 You may also like | **Verified** (as FR-063) |
| FR-065 Help me choose | **Verified**, with one limitation: it does not work with JavaScript fully disabled (§8) |
| NFR-014 Honesty | **Verified** on the pages (TC-E2E-096) |
| FR-066 / FR-068, admin page | R5 |

## 2. What was built
| Part | Files |
|---|---|
| Item page | `src/app/(public)/menu/[slug]/page.tsx`: "Goes well with" and "You may also like" replace "Frequently bought together" and "Related items". Café picks come first, with one reason chip per row; caption "Suggestions are generated automatically from our menu." with a link to Help me choose; skeleton rows while loading; flavour chips under the description |
| Help me choose | `src/app/(public)/help-me-choose/page.tsx`, `src/features/reco/choose-form.tsx`, `choose-params.ts`: three questions as pill-styled native radios and checkboxes; results as menu cards with reasons and flavours; for "A meal", a "Pairs well with" row and "Together ₹X"; empty state with "Remove flavours" / "Start over" |
| Shared UI | `src/features/reco/reco-parts.tsx` (`RecoSection`, `ReasonChips`, `FlavourChips`, skeleton); `MenuCard` gained an optional `extra` slot |
| Entry points | `/menu`: a desktop sidebar card "Not sure what to pick?" and a mobile "Help me choose" button next to "Filters"; the item-page caption link; `/sitemap.xml` |
| Data | `src/server/public-data.ts`: `cachedItemRecommendations`, `cachedSuggestions` (30 s, tag `reco` + `menu` + `offers`); `flavours` labels on the item DTO and on suggestions (`flavourLabels` in `src/lib/validation/reco.ts`) |
| Test database | `scripts/test-db.sh reco` / `npm run test:db:reco`, run by `npm run test:e2e`: a trained, switched-on run for the browser tests |
| Tests | `tests/component/reco.test.tsx` (12), `tests/e2e/reco.spec.ts`, TC-E2E-094 in `tests/e2e/admin-menu.spec.ts`; contract updates in `tests/integration/{api,reco-read}.test.ts` |
| Docs | ADR-075; UI_SPEC §12.12; PRD FR-065; TEST_PLAN; TRACEABILITY; PROGRESS backlog |

## 3. Decisions (ADR-075)
1. **Sold-out café picks are hidden.** Sold-out curated links are no longer shown with an "Out of stock" line, because sold-out dishes are never suggested.
2. **No rate limit on the Help me choose page.** It calls the cached service directly. The answers are fixed values, so the number of possible cache entries is finite. The JSON API keeps its rate limit.
3. **Entry points are always shown.** The Help me choose ranking does not depend on the on/off switch.
4. **The pairing row sits outside the card's link,** so there are no nested links. "Together ₹X" is a plain sum of today's prices, not an offer.

## 4. Commands executed and results
| Command | Result |
|---|---|
| `npx vitest run tests/component/reco.test.tsx` | PASS (12). Mutation checks: showing every reason in a row fails 1; allowing a 4th flavour fails 1 |
| `npm run check` (lint, typecheck, format, unit + component, build) | PASS (30 files, 402 tests; build OK) |
| `npm run test:integration` | PASS (9 files, 133 tests, incl. the updated `flavours` contracts) |
| `npm run test:db:reco` (local test DB only) | PASS: run v1 ACTIVE on the 17-dish test menu |
| `npx playwright test tests/e2e/reco.spec.ts` (Chromium + WebKit) | PASS (46; 4 WebKit visual tests skipped by design) |
| `npm run test:e2e -- --workers=2`, 1st run | 312 passed, 2 FAIL: the `item` desktop/mobile baselines (expected, new sections). The admin and security projects did not run because they depend on a green Chromium project |
| Baselines `item` and `menu` desktop/mobile re-recorded after review | done (the `menu` change was under the 1 % tolerance, so it was regenerated explicitly) |
| `npm run test:e2e -- --workers=2`, 2nd run (all projects) | **PASS: 366 passed, 0 failed, 25 skipped** (21 environment-dependent as before + 4 WebKit visual). TC-E2E-094 passed in Chromium and WebKit |
| JavaScript-disabled check of `/menu`, `/menu/[slug]`, `/help-me-choose` | FAIL for all three (content hidden), pre-existing; see §8 |
| gitleaks: `src`, `tests`, `scripts`, `docs` | PASS (no leaks) |

## 5. Security and honesty
- No new input path except the page URL. Values are parsed against fixed lists: unknown values are ignored and the tag count is bounded before parsing; tested with `<script>` in the URL.
- **No ratings, stars, counts, "people who…", "frequently bought" or demo comments** on the item pages, Help me choose or the menu (TC-E2E-096). Reason text comes only from the fixed list.
- **Sold-out and unpublished dishes never appear** in any list on any of the 14 checked test dishes, nor in Help me choose results. A dish marked sold out by the admin leaves the lists within the 30 s window (TC-E2E-094).

## 6. UI consistency
- Same tokens and components as the rest of the site:
  - `CompactList` card shape;
  - category-pill styles on native inputs (the ADR-062 technique);
  - `MenuCard` grid;
  - `EmptyState`;
  - the menu page frame (cream info strip, breadcrumb).
- No horizontal scroll at 375 / 430 / 768 / 1024 / 1440 px. Every chip and row is ≥ 48 px high below 1024 px.
- The `item` and `menu` visual baselines were updated on purpose (new sections, new sidebar card and mobile button), after I reviewed the new screenshots.

## 7. Self-verification
- Built and started the production server against the test database and looked at the item page, Help me choose (start, results, no results) and the menu, at 1440 / 390 / 375 px.
- Checked several Help me choose results by hand, for example:
  - Classic Veg Burger ₹99 + Masala Lemonade ₹59 = **Together ₹158**;
  - "Cheesy" puts Margherita Pizza first.
- Mutation checks: showing every reason in a row, or allowing a fourth flavour, each makes a component test fail.

## 8. Known issues and limitations
- **Doesn't work with JavaScript off (all dynamic pages, found in R4, ADR-075).** Help me choose, the menu and the item pages show only the page frame.
  - **Cause:** Next.js streams page content, and React needs small inline scripts to reveal it.
  - **Scope:** this has been the case since Phase 4A, so the menu's "works without JavaScript" note in UI_SPEC §12.2 is not accurate either.
  - **What R4 still verifies:**
    - the form is a plain GET form;
    - URLs are shareable;
    - the server's HTML already contains the results.
  - **To fix it:** every public page would need a rendering change. It is in the backlog for the team to decide.
- **Order of Help me choose results:** equally good matches are ordered by time of day (daypart popularity). The visual baselines therefore mask the result cards; their content is checked by the functional tests.
- **Test menu has no meal pairing in ₹100–₹200:** the cheapest main + side/drink costs ₹208, so no pairing is shown there. That is correct behaviour; on the real menu pairings exist (R3 §5C).
- **Production unchanged:** production still has none of this. The push and the production migration come in R5, with written approval.

## 9. Next phase
**R5 — admin and go-live:**
- the admin recommendations page: on/off switch, retrain, weights, runs and rollback, inspect lists;
- flavour-tag and meal-role editors;
- automatic retraining after menu changes;
- then, with written approval only: production migration, generate, train, push to Vercel, and the live `reco:validate`.

---

## HOW TO TEST THIS PHASE

1. **Checks** (Docker Desktop running):
   ```bash
   cd ~/projects/zorko-sangli && git switch phase-r4 && npm ci
   npm run check               # lint, types, format, unit + component tests, build
   npm run test:integration
   npm run test:e2e            # resets the test DB, trains a demo run, runs the browser tests
   ```
2. **See it on your dev database** (recommendations are already switched on there since R3):
   ```bash
   npm run build && PORT=3100 npm run start
   ```
   Then open:
   - http://localhost:3100/menu/korean-burger: "Goes well with" (Korean Mojito, Korean Cheesy Fries…) and "You may also like", each with a small reason line, and the caption with "Help me choose".
   - http://localhost:3100/menu: desktop sidebar card "Not sure what to pick?"; on a phone-sized window, a "Help me choose" button next to "Filters".
   - http://localhost:3100/help-me-choose: answer the three questions and press **Show suggestions**.
3. **Manual checks:**
   - **Meal, ₹100–₹200, Spicy + Cheesy:** up to 5 dishes, all ₹100–₹200, spicy/cheesy ones first. Each has a "Pairs well with" row whose "Together" total is the real sum and stays ≤ ₹200.
   - **Tick a fourth flavour:** it is unticked again and "You can choose up to 3 flavours." appears.
   - **Drink, ₹200+, Spicy:** "Nothing matches all three answers"; "Remove flavours" keeps your mood and budget.
   - **Sold out:** in the admin, mark a dish that appears in "Goes well with" as sold out. Refresh the item page: within 30 s the dish is gone and the list refills.
   - **Shareable:** copy the results URL into a new window; the same answers are ticked.
4. **Not bugs:**
   - With JavaScript switched off the pages stay empty (§8, the whole site, since 4A).
   - The order of equally good suggestions changes with the time of day.
   - The live site (zorko-sangli.vercel.app) does not have this yet.

**If something fails:** send the command and its last 30 lines, or a screenshot plus the browser console errors.
