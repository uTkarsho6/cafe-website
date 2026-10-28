# ZORKO Sangli — Smart Café Digital Platform

Mini Project II (7VSIT345), B.Tech IT, Walchand College of Engineering, Sangli — Utkarsh Patil, Ganesh Mirgane, Anushka Patil. Guide: Smt. Bharati S. Shetty. Academic year 2026-27.

> Student project. Not an official ZORKO website.

**Status:** feature-complete and security-hardened (Phases 0–7 approved); Phase 8 (deployment readiness) prepared, production deployment waiting for the team's accounts and approval. Current phase and approvals: [`docs/PROGRESS.md`](docs/PROGRESS.md).

## What it does

- **Public site:** home, digital menu (search + category, price, popularity and offer filters, sorting, pagination), item details, offers and combos, Student Zone, gallery, about & contact with map, feedback form, QR menu page. No ordering, cart or payments (by design).
- **Admin** (`/admin`, Supabase Auth + allowlist, sign-up disabled): dashboard, menu items and categories (inline prices, availability, labels, images, add-ons, related items), offers and combos, banners, café info and hours, gallery, feedback moderation, table QR cards, audit log.
- **Data:** PostgreSQL (Supabase) through Prisma; RLS deny-all so the Supabase REST API cannot read or write tables; images in Supabase Storage; changes reach the public site within 30 seconds.

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · Prisma 7 · PostgreSQL, Auth and Storage on Supabase · Vercel. Details and versions: [`docs/TRD.md`](docs/TRD.md), [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Documentation

| Doc | Purpose |
|---|---|
| [PRD](docs/PRD.md) | Requirements (FR/NFR) and acceptance criteria |
| [TRD](docs/TRD.md) | Architecture, schema, API contracts |
| [UI_SPEC](docs/UI_SPEC.md) | Authoritative visual spec derived from `design/stitch/` |
| [SECURITY](docs/SECURITY.md) | Threat model and controls |
| [TEST_PLAN](docs/TEST_PLAN.md) | Test strategy and cases |
| [TRACEABILITY](docs/TRACEABILITY.md) | Requirement → code → test → evidence |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Setup, environments, provisioning, rollback |
| [OPEN_QUESTIONS](docs/OPEN_QUESTIONS.md) | Information still needed from the café/team |

## Setup

Requirements: Node.js 22 LTS (≥22.13; `engines` pins `22.x` for Vercel), npm 11, Git. Docker Desktop for the automated DB tests.

```bash
npm ci                                  # install exact versions (also generates the Prisma client)
cp .env.example .env.local              # then set DATABASE_URL and DIRECT_URL (dev Supabase project)
npm run db:migrate:deploy               # create tables + RLS deny-all on the dev database
npm run db:import-menu                  # the real Sangli menu (65 items); or demo data:
# ALLOW_DEMO_SEED=true npm run db:seed  # clearly labelled demo data (refuses in production)
npm run dev                             # http://localhost:3000
```

- Health check: http://localhost:3000/api/health (`"db":"ok"` when the database is reachable)
- Public read API (Phase 3): `/api/v1/categories`, `/api/v1/menu?q=&category=&minPrice=&maxPrice=&popular=1&offers=1&sort=&page=&pageSize=`, `/api/v1/menu/<slug>`, `/api/v1/offers`, `/api/v1/offers/<slug>`, `/api/v1/cafe`. Contracts: [TRD §6](docs/TRD.md).
- Database details, demo-data removal and connection strings: [DEPLOYMENT §5](docs/DEPLOYMENT.md).
- Component style guide (development only): http://localhost:3000/dev/styleguide

## Checks

```bash
npm run lint          # ESLint (zero warnings allowed)
npm run typecheck     # next typegen + tsc
npm run format:check  # Prettier
npm test              # Vitest unit + component tests
npm run build         # production build
npm run check         # all of the above in sequence
npx playwright install chromium webkit   # once per machine
npm run test:integration  # Docker test DB (port 54329) + DB/API integration tests
npm run test:e2e      # Docker test DB + Playwright on Chromium + WebKit (port 3100)
npm run test:supabase # RLS denial check against the dev Supabase project (needs URL + publishable key)
npm run preflight -- .env.prod-admin   # production env check (names only, never values)
```

## Admin

1. Create the admin user in Supabase (Authentication → Users → Add user, Auto Confirm) with sign-up disabled.
2. `npm run admin:add -- --user-id <User UID> --email <email> --name "Name"` (adds it to the allowlist; never handles passwords).
3. Sign in at `/admin/login` (also linked as "Staff portal" in the footer). Details: [DEPLOYMENT §6](docs/DEPLOYMENT.md).

## Deployment

Vercel (region `bom1`, `vercel.json`) + a **separate** production Supabase project. Step-by-step go-live runbook, preflight check (`npm run preflight -- <prod env file>`), backups and rollback: [DEPLOYMENT §14](docs/DEPLOYMENT.md).
