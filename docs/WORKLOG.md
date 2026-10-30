# WORKLOG — resume point and task history

**Purpose:** if a session stops (usage limit, crash, `/clear`), anyone, human or assistant, can read this file and know exactly where the work stands and what to do next. It is updated **after every completed task**, not only at phase ends.

- `docs/PROGRESS.md` holds the official phase status and approvals.
- This file is the finer-grained task log.
- If the two disagree, `PROGRESS.md` wins for approvals; this file wins for "what was the last thing done".

---

## ▶ RESUME HERE

| | |
|---|---|
| **Current phase** | Phase R3 — Recommendation: TypeScript engine, training and APIs |
| **Phase status** | AWAITING TEAM VERIFICATION. R2 approved 2026-10-30 (`phase-r2-approved`, merged into LOCAL `main`). |
| **Git** | Branch `phase-r3`. **Local `main` and `phase-r3` contain migrations production lacks: never push before the R5 production migration.** |
| **Last task completed** | R3 (2026-10-30): engine `src/lib/reco/engine.ts` (exact parity with `notebooks/reco_lib.py`), `src/server/reco/train.ts` + `npm run reco:train`, read path `src/server/services/recommendations.ts`, APIs `/api/v1/menu/[slug]/recommendations` + `/api/v1/recommendations/suggest`, migration `20261030140000_reco_tuned_weights` (applied to dev), `npm run reco:validate`; notebook flag bug fixed (ADR-074); dev DB: run v1 ACTIVE and `RecoSettings.enabled = true`. |
| **Next action** | On "approved, go to Phase R4": item-page sections (reuse `CompactList`), `/help-me-choose` page, menu entry points, `cachedItemRecommendations`/`cachedSuggestions` in `public-data.ts` (tag `reco`), component/E2E/a11y/visual tests (TC-COMP-030/031, TC-E2E-093…096, TC-A11Y-007, TC-RESP-005, TC-VIS-101…). |
| **Waiting on the team** | R3 check; Q-22 (tags), Q-23 (guide), Q-25; hero photo (ADR-065). |
| **Note** | Chat history for the deployment lives in a session opened from `~/projects` (not `~/projects/zorko-sangli`). This Mac runs under very high load, so run E2E with `--workers=2`. NAT64 network: Next's image optimiser refuses Supabase Storage images locally; re-run flaky network tests. |

### On approval (the CLAUDE.md §0.2 step 8 routine)
1. In `PROGRESS.md`: add a row to "Approved phases" (date + quoted message), set the current phase and status to `IN PROGRESS`, and update the branch.
2. `git commit` that change on the phase branch, then:
   ```bash
   git switch main && git merge --no-ff phase-N -m "Merge phase-N (approved)"
   git tag phase-N-approved
   git switch -c phase-(N+1)
   ```
3. Update this file's RESUME HERE block, then start the next phase with a task list.

### How to verify the current state quickly
```bash
cd ~/projects/zorko-sangli
git status && git log --oneline -5 && git tag
npm ci && npm run check                 # lint, typecheck, format, unit tests, build
npm run test:integration                # Docker test DB, expect 103 passed
npm run test:e2e -- --workers=2         # Docker test DB + Playwright, expect 312 passed, 25 skipped
```

---

## Things a newcomer must know (gotchas found so far)

- **Rules:** read `CLAUDE.md` first (phase-by-phase, stop after each phase, exact approval phrase). Never read or print `.env*` (also blocked by `.claude/settings.json`; keep that file byte-for-byte, and note it is excluded from Prettier).
- **Next.js 16.4 is newer than most training data.** Read `node_modules/next/dist/docs/` before coding (see `AGENTS.md`).
  - Cache Components is on. Request data (`searchParams`, `cookies()`) must be read inside `<Suspense>`, otherwise the build fails.
  - Error boundaries use `retry()`.
  - `PageProps` / `LayoutProps` are generated types, so typecheck runs `next typegen` first.
- **Prisma:** npm `latest` is a release candidate (8.0.0-rc). Use stable **7.10.0** (ADR-002). Prisma 7: URLs live in `prisma.config.ts` (CLI) and `src/server/db.ts` (adapter), not in the schema; the client is generated into git-ignored `src/generated/` (ADR-033).
- **`@next/env` skips `.env.local` when NODE_ENV=test** (Vitest). Tests that need it use `process.loadEnvFile('.env.local')`.
- **Prisma refuses `migrate reset` from an AI agent.** The test DB is reset by recreating its Docker container (`scripts/test-db.sh reset`, ADR-034). Docker Desktop must be running for integration/E2E tests.
- **Prisma `contains` does not escape `%`/`_`**: use `escapeLike()` (ADR-037). **A CHECK that evaluates to NULL passes**: use `IS NOT NULL` explicitly (ADR-039).
- **Public pages:** read data via `src/server/public-data.ts` (`'use cache'`, 30 s, tagged) from components inside `<Suspense>` that first touch request data (`connection()`/`searchParams`). Client hooks like `usePathname()` must also sit inside `<Suspense>` or the build fails (ADR-040).
- **Missing item pages return HTTP 200 + noindex** under partial prerendering; this is expected (ADR-041).
- **E2E on WebKit:** wait for hydration (`gotoReady()` = goto + networkidle) before typing or clicking client-enhanced controls.
- **Docker Desktop may stop** between sessions; `open -a Docker` and wait before running integration/E2E.
- With Cache Components, every DB-reading GET route must call `connection()` (use `apiRoute()` in `src/server/http.ts`), or `next build` tries to prerender it.
- **Safari/WebKit specifics:**
  - HSTS and `upgrade-insecure-requests` break `http://localhost`, so they are sent only for https sites (ADR-028).
  - In Playwright WebKit, keyboard tests use **Option+Tab**.
  - Safari doesn't focus buttons on mouse click.
- **`npm ci` "Missing … from lock file":** caused by root-owned files in `~/.npm`. Use `--cache /tmp/zorko-tools/.npm-cache`, or fix the ownership (ADR-030).
- **Dev-only advisory:** `npm audit` shows 5 "high" findings from one dev-only chain (`braces`, no patch exists). Accepted in ADR-032. `npm audit --omit=dev` must stay at 0.
- **Style guide in a production build:** `/dev/styleguide` needs `ENABLE_STYLEGUIDE=true` for both `build` and `start`.
- **Scratch tools** live in `/tmp/zorko-tools`, outside the repo; it may be wiped on reboot. Contents:
  - `outline.py`: Stitch HTML outline;
  - `contrast.py`: WCAG contrast calculator;
  - `render.js`: Stitch reference renders;
  - `mermaid-check.js`: diagram validation;
  - a clean npm cache.

  Recreate them if needed; none are required to build or test the app.
- **gitleaks** runs via Docker:
  ```bash
  docker run --rm -v "$PWD:/repo:ro" ghcr.io/gitleaks/gitleaks:latest git /repo --no-banner --redact
  ```

---

## Task history (newest first)

### Phase R3 — TypeScript engine, training, APIs (2026-10-30) — AWAITING TEAM VERIFICATION
- [x] R2 committed, approval recorded, merged to local `main`, tagged `phase-r2-approved`, branch `phase-r3`.
- [x] Engine + exact parity test (found the notebook's flag-parsing bug; notebook fixed and re-run; R2 report corrected).
- [x] Weight objective HitRate × coverage on validation (500/0/500, 500/200/300); size-aware gate; flavour-first Help me choose (ADR-074).
- [x] Training service, APIs, rate limit; dev migration + training (v1 ACTIVE, metrics = notebook); dev recommendations switched on.
- [x] Validity: 13 unit tests on the real menu, 17 integration tests, live `npm run reco:validate` PASS on 65 dishes + 112 queries (team request).

### Phase R2 — Python/ML notebook (2026-10-30) — AWAITING TEAM VERIFICATION
- [x] R1 approval recorded, merged to local `main`, tagged `phase-r1-approved`, branch `phase-r2`.
- [x] Python 3.14.7 venv `notebooks/.venv` (git-ignored); pinned `notebooks/requirements.txt`.
- [x] `notebooks/reco_lib.py` (exact algorithms) + notebook (31 cells, 7 charts); executed; HTML copy.
- [x] Findings: CF needs baseline residuals and still ≈ baseline (sparsity); popularity bias fixed with coverage ≥ 60 % rule (ADR-073).
- [x] TC-NB-001: rerun and a truly clean venv give byte-identical `reference_scores.json`; removed a user-level Jupyter kernelspec I had registered by mistake.

### Phase R1 — Schema and demo feedback dataset (2026-10-30) — AWAITING TEAM VERIFICATION
- [x] R0 approval recorded, merged to `main`, tagged `phase-r0-approved`, branch `phase-r1`.
- [x] Prisma schema + migration (9 enums, 2 columns, 6 tables, CHECKs, RLS + REVOKE); applied to test DB and dev Supabase.
- [x] Validation `src/lib/validation/reco.ts`; tag rule `src/lib/reco/tag-rules.ts`; generator `src/lib/reco/demo-feedback.ts` (calibrated, ADR-072).
- [x] Scripts `reco:tags` / `reco:generate` / `reco:export` (`prisma/reco-*.ts`); dev data exported to `data/reco/`.
- [x] Tests: 20 unit (mutation-checked), 10 integration, 12 new Supabase REST checks; full check, integration, E2E.

### Phase R0 — Recommendation requirements and design (2026-10-30) — AWAITING TEAM VERIFICATION
- [x] Recorded Phase 8 approval and the production go-live (PROGRESS, ADR-067, NFR-011 Verified).
- [x] Go-live follow-ups: preflight rejects a Supabase URL with a path (TC-UNIT-142); DEPLOYMENT §14 C `admin:list -- --production`.
- [x] `docs/RECOMMENDATION.md`; PRD, TRD, DECISIONS, SECURITY, TEST_PLAN, TRACEABILITY, UI_SPEC, OPEN_QUESTIONS updated.
- [x] Report `docs/PHASE_REPORTS/phase-r0.md`.

### Phase 2 — Application foundation (2026-10-13) — AWAITING TEAM VERIFICATION
- [x] Created `docs/WORKLOG.md` (this file), at the team's request.
- [x] Phase 2 report + PROGRESS → `AWAITING TEAM VERIFICATION` (commit `89089f5`).
- [x] Docs updated: DECISIONS (versions pinned; ADR-028…032), UI_SPEC V-12…V-14, SECURITY (R-12/R-13 + results), TEST_PLAN, TRACEABILITY, README, DEPLOYMENT §4.
- [x] Verification:
  - clean `npm ci`;
  - lint, typecheck, format, 39 Vitest tests, build;
  - 56 Playwright tests (Chromium + WebKit);
  - `npm audit --omit=dev` = 0;
  - bundle secret scan = 0;
  - gitleaks: working tree clean (hits only in ignored `.next/`), git history clean;
  - dev-server smoke test;
  - screenshots reviewed.
- [x] Fixed bugs found during verification: Safari HSTS/upgrade, heading font, 2 contrast failures, touch targets, dialog focus, lockfile, CSS comment, settings.json reformat (details in `phase-2.md` §4).
- [x] Tests: `tests/unit/*`, `tests/component/ui.test.tsx`, `tests/e2e/{foundation,styleguide}.spec.ts`; `vitest.config.mts`, `playwright.config.ts`.
- [x] Style guide `/dev/styleguide` (dev-only) + interactive demos.
- [x] UI components in `src/components/ui/` (≈20).
- [x] App shell: layout + fonts, tokens in `globals.css`, home placeholder, 404/error/global-error, `/api/health`, env validation (`src/lib/config/env.ts` + `instrumentation.ts`), security headers.
- [x] Tooling: ESLint (`react/no-danger`), Prettier, `.env.example`, `.github/workflows/ci.yml` (inactive until a GitHub remote exists).
- [x] Scaffold: reference `create-next-app@16.4.0` in /tmp; dependencies installed with exact pins; Playwright browsers installed.
- [x] Read the Next 16.4 bundled docs (fonts, cacheComponents, error handling, route handlers, headers, CSP, Vitest).
- [x] Phase 1 approval recorded, merged to `main`, tagged `phase-1-approved`, branch `phase-2` created.

### Phase 1 — Requirements, architecture, design spec (2026-10-13) — APPROVED
- [x] PRD, TRD, UI_SPEC, SECURITY, TEST_PLAN, TRACEABILITY, DEPLOYMENT, DECISIONS (ADR-001…027), OPEN_QUESTIONS, README.
- [x] Stitch references rendered to `design/reference/` (5 PNGs).
- [x] Checks: ID cross-references, contrast table, Mermaid diagrams (5/5 render).
- [x] Approved by the team: "approved, go to Phase 2".

### Phase 0 — Repository discovery and baseline (2026-10-13) — APPROVED
- [x] Setup: Stitch zip → `design/stitch/`; synopsis (`MINI PROJECT SYN (2).pdf`) → `docs/source/synopsis.pdf`; `.claude/settings.json`; duplicate root Stitch folder deleted (team instruction).
- [x] `.gitignore`, initial commit on `main`; synopsis read (11 pages); differences D-01…D-15 listed; `PROGRESS.md` created.
- [x] Approved by the team: "approved, go to Phase 1".

---

## Upcoming phases (from CLAUDE.md §12)

3 Database & backend → 4A Public site core → 4B Public site remainder → 5A Auth & admin shell → 5B Menu admin → 5C Offers/banners/café/gallery admin → 6 QR & feedback → 7 Security hardening → 8 Deployment readiness.
