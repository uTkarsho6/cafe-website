# Phase R1 — Recommendation: schema and demo feedback dataset

**Status:** AWAITING TEAM VERIFICATION (2026-10-30)
**Branch:** `phase-r1` (from `main` after the R0 merge). Not pushed; the live site is unchanged.
**Approval that started it:** "approved, go to Phase R1" (2026-10-30)

## 1. Requirements addressed
- **FR-060** Demo feedback dataset: **Verified** (dev database).
- **FR-061** Flavour tags and meal roles: database, validation and initial values **verified**; admin editing follows in R5.
- Security: the new tables are locked like all others (SECURITY AB-19, R-16).

## 2. What was built
| Part | Files |
|---|---|
| Schema and migration | `prisma/schema.prisma`; `prisma/migrations/20261030120000_recommendations/migration.sql` (additive): 9 enums, `MenuItem.flavorTags`, `MenuCategory.mealRole`, tables `DemoVisit`, `DemoRating`, `RecoModelRun`, `ItemRecommendation`, `ItemPopularity`, `RecoSettings`, 19 CHECK constraints, RLS + REVOKE on every new table |
| Validation | `src/lib/validation/reco.ts` (flavour tags, meal roles) |
| Initial tags and roles | `src/lib/reco/tag-rules.ts` (keyword rule), `prisma/reco-tags.ts` (`npm run reco:tags`, create-only) |
| Generator | `src/lib/reco/demo-feedback.ts` (pure, seeded), `prisma/reco-generate.ts` (`npm run reco:generate`, `--replace`, `--production` guard) |
| Export | `prisma/reco-export.ts` (`npm run reco:export`, `--out`), `prisma/reco-menu.ts` (shared loader + guard) |
| Data | `data/reco/menu_items.csv`, `data/reco/demo_feedback.csv` (dev export), `data/reco/reference/feedback_team_v1.csv` (team file, byte-identical copy), `data/reco/README.md` |
| Tests | `tests/unit/reco-data.test.ts` (20), `tests/integration/reco.test.ts` (10), `tests/supabase/rest-denied.test.ts` (+12 checks for the new tables) |
| Docs | ADR-072; RECOMMENDATION §3.1/3.4/3.5 (measured numbers, cut-points); TRD §14.2; TRACEABILITY; SECURITY §11; TEST_PLAN; PROGRESS; WORKLOG |

## 3. Decisions made during the phase (ADR-072)
- **Sold-out dishes are included** in the data. A sold-out dish is filtered only when suggestions are shown, because "sold out" is temporary. This came up because one dev dish was sold out, so only 64 of 65 dishes were generated at first.
- **Stars by fixed cut-points instead of rounding.** Rounding always gave too many 3★.
- **Noise dishes respect the budget**, so the budget rule can be tested exactly.

## 4. The dataset (dev database, seed 2026)
| Measure | Generated | Team's `feedback.csv` |
|---|---|---|
| Rows (ratings) | 2,392 | 2,386 |
| Demo users | 400 (2–12 ratings each) | 400 (2–12 each) |
| Visits | 1,384 (1–4 dishes each) | — (no visits) |
| Dishes covered | **65 of 65, exact names** | 36 (11 exact) |
| 1★ / 2★ / 3★ / 4★ / 5★ | 2.6 / 13.7 / 34.2 / 35.9 / 13.7 % | 3 / 15 / 34 / 34 / 13 % |
| Comment variants | 215 (temperature-correct, no "Best … in Sangli") | 39 |
| Window | 2026-08-01 → 2026-10-29, 11:00–21:59 IST | same |

Check: the real `Feedback` table count is unchanged after generating (TC-INT-093).

**Initial flavour tags (for your review, Q-22):** 54 of 65 dishes have tags. No tag yet: Classic Burger, Veg Exotica Pizza, Steam Momos, Fried Momos, Salted French Fries, Classic Veg Wrap, Plain Maggie, Veg. Masala Maggi, Kulhad Maggi, Surprise Mojito, Special Tea. The full list is in `data/reco/menu_items.csv` (column `flavor_tags`). Admin editing arrives in R5; until then, tell me any changes.

## 5. Commands executed and results
| Command | Result |
|---|---|
| `npx prisma validate`; `prisma migrate diff` (old → new schema) | PASS |
| `npm run test:db:reset` (all 6 migrations on a fresh Postgres) | PASS |
| Project check: `.env.local` is not the production project (IDs compared, never printed) | PASS (different projects) |
| `npx prisma migrate deploy` on the **dev** Supabase project (additive) | PASS ("All migrations have been successfully applied") |
| `npm run reco:tags` / `reco:generate` / `reco:generate -- --replace` / `reco:export` on dev | PASS (9 meal roles, 54 items tagged; numbers in §4) |
| `npx vitest run tests/unit/reco-data.test.ts` | PASS (20) |
| Mutation check: plain rounding and a "hot" cold-drink comment injected on purpose | Both caught (2 tests failed as intended), then restored: PASS |
| `npm run test:integration` | PASS (8 files, 116 tests) |
| `npm run test:supabase` (dev project) | PASS (58 passed; 3 skipped = "credentials missing" placeholders, which correctly do not run when credentials exist) |
| `npm run check` (lint, typecheck, format, unit, build) | PASS (27 files, 362 tests; build OK) |
| gitleaks: git history (70 commits) and `data`, `src/lib/reco`, `prisma`, `docs`, `tests` | PASS (no leaks found) |
| `npm run test:e2e -- --workers=2` (Chromium + WebKit, after the schema change) | PASS (320 passed, 0 failed, 21 skipped (environment-dependent, as in earlier phases), 8.5 min) |
| Production database | NOT RUN (on purpose; R5 with written approval) |

## 6. Security
- **RLS:** enabled on all 6 new tables, no policies; `anon`/`authenticated` privileges revoked (test DB: `has_table_privilege('anon', 'DemoRating', 'SELECT') = f`). The Supabase REST API can't read or write them on the dev project (12 checks).
- **Integrity:** the database rejects ratings outside 1–5, a sentiment that doesn't match the rating, non-demo rows in the demo tables, more than 5 tags, unknown enum values, self-recommendations and out-of-range weights or metrics (TC-INT-092).
- **Isolation:** demo rows only in demo tables; no public API, page or DTO reads them (no runtime code reads them yet).
- **Privacy:** demo users are plain numbers, with no personal data.

## 7. UI consistency
No UI change in R1. The public and admin pages render and work as before: full E2E suite PASS, including visual baselines and the no-ordering / no-forbidden-claims regression on every public page.

## 8. Known issues and limitations
- `RecoSettings` has no row yet; it is created by the first training run (R3). Recommendations stay off (`enabled = false`) until the team switches them on.
- The production database does not have the migration. **Do not merge R1 into `main` and push** before the production migration step, or the live site's code and database will not match. Planned for R5 with your written approval.
- None open from the checks.

## 9. Self-verification
I ran every command in §5 myself. I opened the exported CSVs and checked the rules with a script:
- no "hot" on cold drinks, no "chilled" on food, no place superlatives;
- 400 users, all 65 dishes, real names only, no repeated user–dish pair.

I also broke the generator on purpose to confirm the tests catch it. No manual browser check was needed: there is no UI change, and the full E2E suite passed.

## 10. Next phase
**R2 — Python/ML notebook** for the report: data overview, content model, item–item CF and SVD comparison, visit association rules, Bayesian quality, hybrid with weight search, evaluation (RMSE/MAE, HitRate@5, Precision@5, Recall@5, coverage), optional sentiment model, export of `reference_scores.json`.

---

## HOW TO TEST THIS PHASE

1. **Get the branch and run the checks** (Docker Desktop running):
   ```bash
   cd ~/projects/zorko-sangli
   git switch phase-r1
   npm ci
   npm run check                 # 362 unit tests, build OK
   npm run test:integration      # 116 tests (throwaway local database)
   ```
2. **Look at the dataset:** open `data/reco/demo_feedback.csv` in Excel, Numbers or VS Code. It has your columns plus `visit_id` and `item_slug`, and every dish name is a real Sangli dish. Rows with the same `visit_id` are dishes eaten together, for example a burger + fries + mojito.
3. **Compare with your file:** `data/reco/reference/feedback_team_v1.csv` is your original. The star mix is almost the same (§4).
4. **Check the tags:** open `data/reco/menu_items.csv` and the `flavor_tags` column. Tell me any dish whose tags are wrong or missing (Q-22).
5. **Optional, regenerate on your machine** (dev database; same seed → same rows):
   ```bash
   npm run reco:generate -- --replace && npm run reco:export
   git diff --stat data/reco     # expect no change
   ```

**Not bugs:**
- Nothing changes on the website in this phase.
- Recommendations are off until R4/R5.
- Don't push `phase-r1` into `main` yet (see §8).

**If something fails:** send the command and its last 30 lines of output.
