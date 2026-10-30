# Phase R0 — Recommendation system: requirements and design

**Status:** AWAITING TEAM VERIFICATION (2026-10-30)
**Branch:** `phase-r0` (from `main`, uncommitted until the team allows a commit; team rule of 2026-10-28)
**Started by:** "sure add falvour tags as it is pure veg, and proceedRo" (2026-10-30)

## 1. Requirements addressed
- New PRD §5.3: FR-060…FR-069 and NFR-013/014 (food recommendations, the guide's request), all with testable acceptance criteria.
- Go-live follow-ups: NFR-011 marked Verified (site live since 2026-10-29 IST), plus two fixes found during deployment.

## 2. Design decisions (summary)
| ADR | Decision |
|---|---|
| ADR-067 | Go-live recorded; preflight now rejects a Supabase URL with a path such as `/rest/v1/`; `admin:list -- --production` in DEPLOYMENT §14 C |
| ADR-068 | Hybrid recommender (content + rating-based item CF + visit co-occurrence + Bayesian quality), precomputed versioned runs with quality gate, rollback and on/off switch; TypeScript in the app, Python notebook as reference |
| ADR-069 | Flavour tags (13 fixed values) on items and meal roles on categories, because the outlet is pure veg |
| ADR-070 | Help me choose is a server-rendered page (`/help-me-choose`), not a client wizard |
| ADR-071 | **Training data = generated demo feedback (ratings) in the team's `feedback.csv` format plus `visit_id`, for all 65 real dishes**; the team's file is kept as a reference. The team chose this on 2026-10-30 because the site has no orders or billing. An earlier draft the same day used synthetic bills and was replaced. |

## 3. Cross-check of the team's `feedback.csv` (RECOMMENDATION §3.0)
| Check | Result |
|---|---|
| Rows / users / dishes | 2,386 / 400 / 36 |
| Structure (IDs, one name per item_id, no repeated user–dish pair, rating ↔ sentiment) | PASS |
| Dish names matching the Sangli menu exactly | **11 of 36** (about 11 near-matches, about 14 not on the menu) |
| Real dishes without any rating | **29 of 65** |
| Content issues | 39 templates; 58 cold drinks "fresh and hot"; "Best X in Sangli" claims |
| Pairing signal | none (one dish per row), so `visit_id` is added in the generated data |

## 4. Files
- **New:** `docs/RECOMMENDATION.md`, `docs/PHASE_REPORTS/phase-r0.md`.
- **Modified:**
  - `docs/PRD.md` (§5.3, NFR-013/014, scope, sitemap);
  - `docs/TRD.md` (§14: architecture diagram, modules, schema, APIs, caching, trade-offs);
  - `docs/DECISIONS.md` (ADR-067…071);
  - `docs/SECURITY.md` (asset, AB-17…21, R-14…16);
  - `docs/TEST_PLAN.md` (§4.9, about 40 new test IDs);
  - `docs/TRACEABILITY.md` (FR-060…069, NFR-013/014 Planned; NFR-011 Verified);
  - `docs/UI_SPEC.md` (flavour, selectable and reason chips; item-page lists; §12.12 Help me choose; admin Recommendations; derived screens; components);
  - `docs/OPEN_QUESTIONS.md` (Q-22…25);
  - `docs/PROGRESS.md`, `docs/WORKLOG.md`, `docs/DEPLOYMENT.md`;
  - `scripts/preflight.mjs`, `tests/unit/preflight.test.ts`.

## 5. Commands executed and results
| Command | Result |
|---|---|
| `npx vitest run tests/unit/preflight.test.ts` | PASS (9 tests, incl. new TC-UNIT-142) |
| `npm run check` (lint, typecheck, format, unit, build) | PASS (26 files, 342 tests; build succeeded) |
| Mermaid parse of the new TRD §14.1 diagram (mermaid 11 parser) | PASS (after fixing two edge-label syntax errors) |
| Pattern scan of the diff for secrets (keys, JWTs, DB URLs) | PASS (none found) |
| gitleaks | NOT RUN (Docker Desktop not running) |
| Integration / E2E | NOT RUN (no runtime code changed besides the preflight script, which is covered by unit tests) |
| `curl https://zorko-sangli.vercel.app/api/health` | PASS (`status ok, db ok`, 2026-10-30) |

## 6. Security and honesty review
- New threats and controls are in SECURITY AB-17…21 and R-14…16: endpoint abuse, admin tampering, data poisoning, retrain flooding, misleading claims.
- Demo ratings and comments are designed to live only in `DemoVisit`/`DemoRating`. They never reach the real `Feedback` table (public reviews and moderation), and no ratings, counts or comments appear publicly (ADR-026, CLAUDE.md §6.2).
- The new tables get RLS deny-all in the R1 migration (TC-SEC-135).

## 7. UI consistency
No new tokens, fonts or radii. New screens reuse `CompactList`, `MenuCard`, category-pill chip styles, `EmptyState`/`ErrorState`, `Tabs`, `DataTable`, `Switch` and `SummaryCard`, and are listed as derived screens (UI_SPEC §15). The Lucide icons used (UtensilsCrossed, Cookie, CupSoda, IceCreamCone, Sparkles) were checked to exist in the installed lucide-react 1.56.0.

## 8. Known issues and limitations
- Metrics in R2/R3 will measure the generated data's patterns, not real taste. The report must say so (Q-23).
- Hero photo licence and veg concern (ADR-065) still open; unrelated to this phase.

## 9. Self-verification
Ran the checks above and validated the diagram with the Mermaid parser. Re-read every changed section to remove the superseded "bills" wording. Checked the live site's health endpoint. No browser exercise was needed: there is no UI change in R0.

## 10. Next phase
**R1 — Schema and demo feedback dataset** (dev database only): migration (flavour tags, meal roles, DemoVisit, DemoRating, RecoModelRun, ItemRecommendation, ItemPopularity, RecoSettings, RLS), initial tags/roles script, generator, CSV export, the team's file stored as a reference, tests TC-UNIT-130…134, TC-INT-092/093, TC-SEC-135.

---

## HOW TO TEST THIS PHASE

R0 is documentation plus one small script fix, so testing means reading and one command.

1. **Run the checks:**
   ```bash
   cd ~/projects/zorko-sangli
   git switch phase-r0
   npm run check            # expect: lint/typecheck/format clean, 342 tests passed, build OK
   ```
2. **Read the design:** `docs/RECOMMENDATION.md`. Check in particular:
   - §2.1 flavour tags: do the examples fit the real dishes?
   - §2.2 meal roles: is Momos a "side" and Maggi a "main" for you?
   - §3.0 the cross-check of your `feedback.csv`: do you agree with the findings?
   - §3.3–3.6 how the demo users, visits, ratings and comments are generated.
   - §6 the wording rules: no ratings, counts or comments are ever shown publicly.
3. **Look at the screens described** in `docs/UI_SPEC.md` §12.3 (item page lists), §12.12 (Help me choose) and §13 (admin Recommendations).
4. **Answer the open questions** Q-22…Q-25 in `docs/OPEN_QUESTIONS.md`, or reply "as proposed". Q-23 is for your guide.
5. **Optional:** the preflight fix. `npx vitest run tests/unit/preflight.test.ts` should show 9 passed.

**Not bugs:** nothing changes on the website in this phase; the live site is untouched. The phase branch is not committed yet, because commits need your permission (your rule from 2026-10-28).

**If something is wrong:** tell me the section number and what you want changed, or paste the command output.
