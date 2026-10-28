# Phase 8 — Deployment readiness

**Status:** AWAITING TEAM VERIFICATION · Branch `phase-8` (from `main` after `phase-7-approved`) · 2026-10-29
**Production deployment:** BLOCKED on the team's accounts and written go-ahead (Vercel, production Supabase project, domain).

## Requirements addressed
CLAUDE.md §12 Phase 8 (production env vars, database setup, migrations, HTTPS, trusted origins, storage, logging, health check, backup and rollback docs, production build, public-artifact secret scan, final README); §16 items 14–16, 18.

## Files created or modified
| File | Change |
|---|---|
| `vercel.json` (new) | Function region `bom1` |
| `package.json` | `engines.node` `22.x`; scripts `preflight`, `scan:build` |
| `scripts/preflight.mjs` (new) | Production env check, names only (ADR-066) |
| `scripts/scan-build.mjs` (new) | Secret-value scan of build output |
| `tests/unit/preflight.test.ts` (new) | TC-UNIT-125 (8 tests) |
| `prisma/import-menu.ts` | Production only with `--production` (same rule as the admin/gallery scripts) |
| `docs/DEPLOYMENT.md` | v2.0: §14 go-live runbook (Supabase, database, first admin, Vercel, verification, rollback), safety rules, troubleshooting rows |
| `README.md` | Final: status, features, setup with the real menu, admin, deployment |
| `docs/DECISIONS.md`, `TEST_PLAN.md`, `PROGRESS.md`, `WORKLOG.md` | ADR-066, TC-UNIT-125, Phase 7 approval, Phase 8 state |

## Decisions
ADR-066. Main finding: `.env.production(.local)` would be loaded automatically by Next.js and the Prisma CLI, so a laptop could silently run against production. The runbook forbids it and uses a subshell helper with `VERCEL_ENV=production` instead.

## Commands executed and results
| Check | Result |
|---|---|
| `npm run build` (production) | PASS |
| Secret values in build output (552 files; secret key, DB URLs and password, salt, test passwords) | PASS: 0 found. Negative test with a planted value: detected (exit 1) |
| gitleaks (local image, offline, read-only; 67 commits) | PASS: no leaks |
| `npm audit` (production deps / all deps) | PASS: 0 vulnerabilities / 0 |
| Preflight unit tests | PASS: 8 |
| Preflight against the dev `.env.local` | FAIL as expected (8 problems: test accounts, http localhost, dev project, dev salt); names only |
| `prod` helper dry run against the local test database | PASS: Prisma used `127.0.0.1:54329`, not `.env.local`; import guard refused without `--production` |
| Lint, typecheck, format | PASS |
| Unit + component | PASS: 341 (26 files) |
| Final build + artifact scan | PASS / PASS |

## Security checks
- Security headers incl. HSTS when the site URL is https (ADR-028), CSP (ADR-053), Origin-checked Server Actions, `poweredByHeader: false`: unchanged since Phase 7, verified there.
- Public env: production refuses a missing, http or localhost `NEXT_PUBLIC_SITE_URL` (`src/lib/config/env.ts`); server env fails closed by name (`src/server/env.ts`, `src/server/auth/env.ts`).
- Production data scripts: admin allowlist, gallery photos and menu import all need `--production`; demo seed and demo removal refuse production.

## Not run / not verifiable here
- Anything on a real production project or Vercel: migrations, RLS check, first admin, deployment, HTTPS certificate, custom domain, post-deploy checklist (§14 E).
- Linux visual baselines (only macOS baselines exist; Q-16).

## Known issues for the team
- Hero photo looks non-veg against the "100% VEG" badge; licence unknown (ADR-065).
- Opening hours unconfirmed: tick "Opening hours confirmed" in Admin → Café info when the café confirms.
- Social links unverified (Q-03/Q-04).

## HOW TO TEST THIS PHASE
```bash
cd ~/projects/zorko-sangli && git checkout phase-8
npm run build && npm run scan:build -- .env.local      # PASS  no secret values in build output
npm run preflight -- .env.local                       # FAILs on purpose: .env.local is the DEV file
npm test                                              # includes TC-UNIT-125
```
1. Read `docs/DEPLOYMENT.md` §14 start to finish; every step should be clear without asking.
2. Create `.env.prod-admin` only when you have the production project; `npm run preflight -- .env.prod-admin` must PASS before anything else.
3. Check the README reads correctly for a new team member.

**To deploy:** create the Vercel account and the production Supabase project, then reply with written approval, for example "approved to deploy to production". Credentials go into Vercel and `.env.prod-admin` yourself; never paste them in chat.

Phase 8 complete (pre-deployment). Waiting for your approval or bug reports. To approve, reply exactly: approved, go to deployment
