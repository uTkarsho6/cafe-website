# SECURITY — Threat Model and Controls

**Version:** 1.0 (Phase 1, initial threat model), 2026-10-13. Reviewed again in Phase 5A, 5B and 7; recommendation system added in Phase R0 (2026-10-30).
**Checklists used:** OWASP Top 10:2025 and OWASP API Security Top 10:2023. Category names are to be re-checked against owasp.org at the Phase 7 review.
**Status legend:** Planned · Implemented (phase) · Verified (test ID).

## 1. Assets

| Asset | Sensitivity | Why it matters |
|---|---|---|
| Admin accounts and sessions | High | Full content control; defacement; misleading prices or offers |
| `SUPABASE_SECRET_KEY`, `DATABASE_URL`/`DIRECT_URL`, `RATE_LIMIT_SALT` | Critical | Full database/storage access, bypassing RLS |
| Menu, prices, availability, offers, café info | Medium (integrity) | Customers act on them; wrong prices hurt trust |
| Feedback content | Low–medium (privacy) | May contain personal statements; unmoderated content is a defacement/XSS vector |
| Audit log | Medium | Accountability; must not be tampered with |
| Storage bucket | Medium | Hosting malicious files under the café's domain |
| Availability of the public site | Medium | Demo, viva, customers at the counter |
| Recommendation model runs, weights and settings | Low–medium (integrity) | A tampered or bad run shows poor or misleading suggestions; demo ratings must never be presented as real reviews or sales data |

## 2. Trust boundaries

1. **Browser ↔ Next.js:** everything from the client is untrusted (query, body, cookies, headers, files).
2. **Next.js ↔ Supabase Postgres:** a privileged connection (Prisma bypasses RLS), so authorization is enforced in our server code.
3. **Browser ↔ Supabase directly:** the publishable key is public, so the auto REST/GraphQL API must expose nothing (RLS deny-all + REVOKE). The Storage public bucket is read-only.
4. **Next.js ↔ Supabase Auth:** JWT validation via `getClaims()`/`getUser()`.
5. **Admin ↔ public data:** admin-entered text and URLs are rendered to the public, so they are treated as untrusted output (escaping, URL scheme checks).
6. **Third parties:** Google Maps iframe, Vercel, npm dependencies.

## 3. Attack surface

- Public GET pages and `/api/v1/*` (query parsing, search).
- Feedback submission: a Server Action on `/feedback` (POST-only, Origin-checked; ADR-051).
- `/admin/login` Server Action.
- All admin Server Actions.
- POST `/api/admin/uploads`.
- POST `/api/admin/logout`.
- The Supabase REST/GraphQL/Storage endpoints of our project.
- Build artefacts (client JS bundles), the repository, CI logs.
- Environment configuration on Vercel.

## 4. Threat actors

- Anonymous internet users and bots: spam, scraping, credential stuffing.
- A curious customer who inspects the JS bundle or calls Supabase REST with the public key.
- A non-admin Supabase user. Signup is disabled, but an account could exist through a misconfiguration.
- A malicious or compromised admin account.
- Supply-chain compromise through an npm package.
- Accidental insiders: committed secrets, a production migration run by mistake.

## 5. Abuse cases

| ID | Abuse case | Control |
|---|---|---|
| AB-01 | Brute-force or stuffed admin passwords | Login rate limit (IP and IP+email), generic errors, Supabase's own limits, strong-password policy in Supabase |
| AB-02 | Read or modify tables via Supabase REST with the publishable key | RLS enabled with no policies + `REVOKE ALL` from anon/authenticated (ADR-009); TC-SEC-020 |
| AB-03 | Call an admin Server Action without being an admin (replayed action ID) | `requireAdmin()` inside every action; TC-SEC-001…006 |
| AB-04 | Forged or expired JWT cookie | `getClaims()`/`getUser()` validation; TC-SEC-003/004 |
| AB-05 | Mass assignment (for example `isArchived`, `id`, `adminUserId` in a payload) | Zod `.strict()` allowlists; services set server-controlled fields; TC-SEC-030 |
| AB-06 | Stored XSS via feedback or admin text | React escaping; no `dangerouslySetInnerHTML`; ESLint rule; TC-SEC-040/041 |
| AB-07 | `javascript:` or `data:` banner/social links, or an open redirect via `next` | `safeHref` / `httpsUrl` validators; `next` must be an internal `/admin` path; TC-SEC-050/051 |
| AB-08 | Disguised or oversized upload (HTML/SVG/polyglot renamed `.jpg`) | Magic bytes + `sharp` decode/re-encode to WebP; 5 MB limit; no SVG; TC-SEC-060…064 |
| AB-09 | Feedback spam or flooding | Honeypot, rate limit, length limits, moderation queue; TC-SEC-070 |
| AB-10 | CSRF on cookie-authenticated POSTs | Server Actions (Next Origin check) + explicit Origin allowlist on Route Handlers; `SameSite=Lax`; TC-SEC-080 |
| AB-11 | SQL injection through search | Prisma parameterised `contains` with `mode: insensitive`; no raw SQL with input; TC-SEC-090 |
| AB-12 | Expensive queries (huge `pageSize`, long `q`) | Zod caps (`pageSize`≤48, `q`≤60); body size limits; TC-SEC-091 |
| AB-13 | Secret leak in the client bundle or repo | `server-only` imports; no secrets in `NEXT_PUBLIC_*`; bundle grep + gitleaks in CI; TC-SEC-100/101 |
| AB-14 | Clickjacking the admin | `frame-ancestors 'none'` / `X-Frame-Options: DENY`; TC-SEC-110 |
| AB-15 | Showing expired offers or unapproved feedback | Server-side status filters; TC-INT-030, TC-INT-040 |
| AB-16 | QR code pointing to a wrong or attacker site | URL from env, validated (https, not localhost, in production); shown in the admin with a warning; TC-UNIT-030 |
| AB-17 | Flood or probe the recommendation endpoints (huge or odd `tags`, unknown slugs, cache-key explosion) | Zod enums only (mood, budget, ≤3 known tags, slug regex) → finite cache keys; 60/min rate limit; no scores or IDs in responses; TC-SEC-131/132 |
| AB-18 | Tamper with weights, activate a run, or switch recommendations off without being an admin; mass-assign `status`/`activeRunId` | `requireAdmin()` in every reco action (covered by `authz-guard.test.ts`); Zod `.strict()` per-mille integers; run ID must exist and be ACTIVE/ARCHIVED; audit entry; TC-SEC-133/134 |
| AB-19 | Poison the training data | No public input feeds training: demo ratings are generated server-side from the menu; real public feedback (no dish or rating fields today) and query parameters are never used. A future POS source is admin-provisioned (RECOMMENDATION §7); TC-INT-095 |
| AB-20 | Exhaust the database by triggering many retrains | Retrain is admin-only, coalesced by a lock + pending flag, rate limited (5/min per admin), and auto-retrain runs at most once per admin action; TC-INT-096 |
| AB-21 | Misleading public claims from demo data ("rated 4.8", "guests loved…", a demo comment shown as a review) | Demo ratings/comments live only in `DemoRating`, never in `Feedback`; no ratings, counts or comment text in DTOs; reason codes from a fixed list; TC-E2E-096 checks the page text |

## 6. STRIDE analysis

| Threat | Where | Mitigation | Residual |
|---|---|---|---|
| **S**poofing | Admin login, session cookies | Supabase Auth, JWT validation per request, allowlist, rate limit | Phished admin password (no MFA in v1; Q-14 suggests enabling Supabase MFA) |
| **T**ampering | Admin mutations, DB via REST, uploads | `requireAdmin` + Zod on every action; RLS deny-all/REVOKE; re-encoded uploads; FK/CHECK constraints | A compromised admin can still edit content (the audit log shows who) |
| **R**epudiation | Admin changes | Append-only `AuditLog` written in the same transaction; admins have no UI to edit it | DB owner can alter logs (accepted) |
| **I**nformation disclosure | API DTOs, errors, bundles, logs | Explicit `select`; safe error messages; `server-only`; log redaction | Supabase dashboard access is managed by the team |
| **D**enial of service | Feedback, login, search, uploads | Rate limits, size caps, pagination caps, Vercel/Supabase platform limits | Large-scale DDoS (platform-level only) |
| **E**levation of privilege | Non-admin user to admin; client role flags | Allowlist table, never trust client flags, no self-service role change; provisioning script needs the secret key | Misconfigured dashboard (signup left on). Signup-disabled check in the DEPLOYMENT checklist + TC-SEC-006 |

## 7. Risk register

Scales: L(ikelihood) and I(mpact) are 1–3; Risk = L×I.

| ID | Risk | L | I | Risk | Mitigation | Residual |
|---|---|---|---|---|---|---|
| R-01 | Supabase REST exposes tables | 2 | 3 | 6 | ADR-009, TC-SEC-020 against the dev project | Low |
| R-02 | Missing `requireAdmin` in a new action | 2 | 3 | 6 | Static guard test (`authz-guard.test.ts`: every admin page and every exported action awaits `requireAdmin()` first) + per-module enumeration tests + E2E replay | Low |
| R-03 | Secret committed or bundled | 2 | 3 | 6 | `.gitignore`, gitleaks, bundle scan, `.claude/settings.json` deny on `.env` | Low |
| R-04 | Credential stuffing on admin | 2 | 3 | 6 | Rate limit, strong passwords, browser-session cookies, 30 min idle / 12 h max sessions (ADR-052), optional MFA (Q-14) | Low–Med |
| R-05 | Stored XSS via admin/feedback text | 1 | 3 | 3 | Escaping, CSP, tests | Low |
| R-06 | Malicious upload | 1 | 2 | 2 | ADR-015 | Low |
| R-07 | CSP needs `'unsafe-inline'` scripts | 2 | 2 | 4 | Evaluated in Phase 7 (ADR-053): nonces would make every page dynamic; SRI with `script-src 'self'` breaks Next's inline streaming scripts. Compensating controls: React escaping, no `dangerouslySetInnerHTML` (lint rule), no `eval` (`'unsafe-eval'` blocked, Zod jitless), `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, admin text and feedback rendered as text | Low–Med (accepted) |
| R-08 | Destructive migration on prod | 1 | 3 | 3 | Rule 14, separate projects, `pg_dump` before deploy | Low |
| R-09 | Free-tier pause or outage during demo | 2 | 2 | 4 | Wake before the demo; health check | Low |
| R-10 | Vulnerable dependency | 2 | 2 | 4 | `npm audit` in CI, pinned lockfile, minimal deps | Low–Med |
| R-11 | Feedback contains personal data | 2 | 1 | 2 | Moderation, no contact fields, retention rule | Low |
| R-12 | Dev-only advisory `braces` ≤3.0.3 via ESLint tooling, no patch available (ADR-032) | 1 | 1 | 1 | Not shipped; prod audit clean; re-check each phase | Low (accepted) |
| R-13 | HSTS/upgrade on http hosts breaking Safari (found in Phase 2) | — | — | — | Fixed (ADR-028), regression-tested | Closed |
| R-14 | Recommendations read as sales facts (CLAUDE.md §6.2) | 2 | 2 | 4 | Fixed reason codes, caption "generated automatically from our menu", admin labels the DEMO source, NFR-014 test | Low |
| R-15 | A bad training run degrades suggestions on the live site | 2 | 1 | 2 | Quality gate, versioned runs with one-click rollback, on/off switch, read-time availability filter | Low |
| R-16 | New tables reachable through Supabase REST | 1 | 2 | 2 | R1 migration enables RLS + REVOKE on every new table; TC-SEC-020 extended | Low |

## 8. OWASP Top 10:2025 checklist

| # | Category | Controls in this project | Status |
|---|---|---|---|
| A01 | Broken Access Control | `requireAdmin` in every operation; deny by default; RLS deny-all; IDOR-safe (no per-user data; admin-wide scope); safe `next` redirect | Verified (5A–7: authz matrix, static guard, E2E anonymous replay, IDOR tests) |
| A02 | Security Misconfiguration | Env validation; security headers; Supabase signup disabled; production checks (https site URL); no debug output | Verified (headers E2E, env validation, signup disabled, prod URL checks); Phase 8 re-checks Vercel settings |
| A03 | Software Supply Chain Failures | Lockfile, `npm ci`, `npm audit`, minimal deps, gitleaks, pinned versions, no RCs | Verified (lockfile, pinned deps, prod audit 0, gitleaks history clean); dev-only R-12 accepted |
| A04 | Cryptographic Failures | HTTPS/HSTS; Supabase password hashing; HMAC for rate-limit keys; no custom crypto | Verified (HMAC keys/cookies, Supabase hashing, HSTS on https); no custom crypto |
| A05 | Injection | Prisma parameterised queries; Zod; React escaping; no raw SQL with input | Verified (Prisma only, Zod everywhere, injection payload tests, React escaping) |
| A06 | Insecure Design | Threat model (this doc); no ordering/payment surface; least data | Verified (threat model reviewed in Phase 7; no ordering/payment surface) |
| A07 | Authentication Failures | Supabase Auth; rate limit; generic errors; session expiry; logout revokes | Verified (rate limits, generic errors, getUser validation, forged/expired tokens, idle/max sessions) |
| A08 | Software or Data Integrity Failures | Audit log; transactions; re-encoded uploads; no untrusted deserialisation | Verified (audit log on every admin change, transactions, re-encoded uploads, Origin-checked actions) |
| A09 | Logging & Alerting Failures | Audit log; structured server logs without secrets; failed-login audit | Verified for the app (audit log, structured logs without secrets); alerting is Phase 8 (Vercel logs) |
| A10 | Mishandling of Exceptional Conditions | Central error mapping; safe 5xx; error boundaries; DB-down health status | Verified (generic 5xx, error boundaries, health 503, no stack traces: E2E probe) |

## 9. OWASP API Security Top 10:2023 checklist

| # | Category | Controls | Status |
|---|---|---|---|
| API1 | Broken Object Level Authorization | Public objects are public by design; admin objects behind `requireAdmin`; unpublished/expired filtered server-side | Verified (unpublished/expired filtered; admin objects behind requireAdmin; IDOR-scoped image/item operations) |
| API2 | Broken Authentication | Supabase JWT validation; rate limits | Verified (getUser + allowlist; forged/expired tokens; rate limits) |
| API3 | Broken Object Property Level Authorization | Explicit DTO `select`; Zod `.strict()` input | Verified (strict DTOs; form fields dropped, JSON strict) |
| API4 | Unrestricted Resource Consumption | pageSize ≤48, q ≤60, body ≤8 KB (JSON) / 5 MB (upload), rate limits | Verified (caps; 6 MB action body limit, oversized request refused in E2E; rate limits) |
| API5 | Broken Function Level Authorization | Admin functions only in `(admin)` actions with `requireAdmin` | Verified (static guard + E2E replay) |
| API6 | Unrestricted Access to Sensitive Business Flows | Feedback flow limited (honeypot + rate limit + moderation) | Verified (Phase 6: unit, integration, E2E) |
| API7 | Server-Side Request Forgery | The server fetches no user-supplied URLs (banner links are only rendered) | N/A by design |
| API8 | Security Misconfiguration | Headers, CORS not enabled (same-origin only), env checks | Verified (headers, no CORS, env checks) |
| API9 | Improper Inventory Management | All endpoints listed in TRD §6; no undocumented routes; `/dev/*` 404 in production | Verified (route inventory: 8 GET route handlers + 5 Server Action modules, all documented) |
| API10 | Unsafe Consumption of APIs | Only Supabase SDK responses; typed and checked | Verified (typed Supabase SDK use only) |

## 10. Specific controls (summary)

- **Headers:** see ADR-016. CORS: no `Access-Control-Allow-Origin` header on any route (same-origin only).
- **Cookies:** set by `@supabase/ssr`: `HttpOnly`, `Secure` (production), `SameSite=Lax`, path `/`, browser-session only (no Max-Age). A signed activity cookie enforces 30 min idle / 12 h maximum admin sessions (ADR-052). Verified in Phases 5A and 6.
- **Secrets:**
  - `.env.example` contains placeholders only; `.env*` is git-ignored.
  - `.claude/settings.json` denies the assistant reading `.env` files.
  - Values are never printed in reports.
  - If a secret is exposed: rotate it in Supabase (keys / DB password), update Vercel env, redeploy, and record it in the phase report.
- **Database (Phase 3):** Prisma connects as the privileged `postgres` role and bypasses RLS, so authorization is in server code. RLS is enabled on every table with **no policies**, and all table/sequence/function privileges are revoked from `anon` and `authenticated` (plus default privileges for future objects), so the Supabase REST/GraphQL APIs expose nothing. A test fails if any future table lacks RLS. Queries have a 10 s `statement_timeout`; the pool is capped at 5 connections per server instance.
- **Privacy:** feedback has no contact fields; rate-limit buckets hold HMACs only and are pruned after 24 h; rejected feedback is deleted after 90 days; the map iframe discloses that it loads from Google.

## 11. Verification results

| Test group | Phase | Result |
|---|---|---|
| Security headers (unit: CSP directives, HSTS only on https, no Supabase in script-src) | 2 | PASS (5 tests) |
| Security headers on `/`, `/api/health`, 404 (E2E, Chromium + WebKit): CSP, XFO, nosniff, Referrer-Policy, Permissions-Policy, no X-Powered-By, no CORS header (TC-SEC-110/111) | 2 | PASS |
| Env validation never echoes values (TC-UNIT-002/003 for `NEXT_PUBLIC_SITE_URL`) | 2 | PASS |
| Client bundle scan for secret names/values (TC-SEC-100) | 2 | PASS: 0 matches in `.next/static` |
| gitleaks 'dir' scan of the working tree (Docker `ghcr.io/gitleaks/gitleaks:latest`) | 2 | PASS for project files. 8 hits only in git-ignored `.next/` (per-build Next.js preview/encryption keys, server-side, never committed) |
| gitleaks scan of git history (TC-SEC-101) | 2 | See phase-2 report |
| `npm audit --omit=dev` (TC-SEC-102) | 2 | PASS: 0 vulnerabilities. Full audit: 5 high, all one dev-only chain (R-12, ADR-032) |
| ESLint `react/no-danger` enforced | 2 | PASS (lint clean) |
| RLS enabled on **every** `public` table (17/17), zero policies; `anon` and `authenticated` get `permission denied` on SELECT/DELETE of every table and on INSERT (TC-SEC-022, local Postgres with Supabase roles) | 3 | PASS |
| Supabase REST API denial against the real dev project (TC-SEC-020) | 3 (Round 2) | **PASS**: 34/34 against the dev project after migrations (17 tables × read / write attempts) |
| Injection payloads (SQL, LIKE wildcards, template, NoSQL-style, XSS strings) in `q`, slugs and `category` (TC-SEC-090) | 3 | PASS: search treats them as text (0 results, 200); slugs/category rejected with 400 before the DB |
| LIKE wildcard escaping (`%`, `_`, `\` in search) — defect found and fixed in Phase 3 (TC-UNIT-013) | 3 | PASS |
| Error responses never contain stack traces, SQL, Prisma codes or connection details; DB outage → 503 generic (TC-UNIT-080, TC-INT-080) | 3 | PASS |
| Public DTO contracts are `.strict()` Zod schemas: no internal fields (`isDemo` on items, `isArchived`, `isPublished`, `createdAt`, admin IDs) leak (TC-INT-050) | 3 | PASS |
| Database CHECK/UNIQUE/FK constraints enforced independently of app validation (TC-INT-001…003) | 3 | PASS (one constraint defect found and fixed: NULL promo price passed the CHECK) |
| Client bundle scan for `DATABASE_URL`, `DIRECT_URL`, `postgresql://`, `PrismaClient`, `SUPABASE_SECRET` (TC-SEC-100) | 3 | PASS: 0 matches in `.next/static` |
| gitleaks `dir` scan | 3 | PASS for project files; 12 hits only in git-ignored `.next/` (per-build keys, as in Phase 2) |
| `npm audit --omit=dev` (TC-SEC-102) | 3 | PASS: 0. Full audit: only the accepted dev-only `braces` chain (ADR-032). Prisma CLI advisories fixed with overrides (ADR-036) |

Manual threat-model review: initial version written in Phase 1; to be re-reviewed with the team in Phase 7. Automated scans cannot prove security.
| **Phase 7 regression and hardening (2026-10-16)** | 7 | |
| `npm audit --omit=dev` | 7 | PASS: 0 vulnerabilities. Full audit: the same 5 dev-only highs (`braces` ≤3.0.3 via ESLint tooling; no patched release yet, R-12) |
| gitleaks: git history | 7 | PASS: no leaks |
| gitleaks: working tree | 7 | PASS for tracked files. 13 hits, all in git-ignored files: `.env.local` (the real local secrets, expected) and `.next/` build output (Next's own per-build preview/encryption keys, server-side only) |
| Client bundle scan (`.next/static`, 42 files) for the values of every secret env var and for `sb_secret_`, `service_role`, `postgres://` | 7 | PASS: 0 values. The text `SUPABASE_SECRET_KEY` appears only as a variable name in the admin "uploads are switched off" message |
| Code review: `dangerouslySetInnerHTML`, `eval`/`new Function`, raw SQL, `target=_blank` without `rel`, `console.*`, sensitive log fields | 7 | PASS: none in app code (raw SQL only in Prisma's generated client) |
| Static authorization guard: 15 admin pages and 26 admin Server Actions await `requireAdmin()` first (`authz-guard.test.ts`) | 7 | PASS |
| Real-server attack replays (`security.spec.ts`): captured admin action replayed without a session → refused, nothing changed; replayed with the admin's cookies from a foreign Origin → refused, nothing changed; same request from the site's own origin → works (positive control); 7 MB body → refused, nothing stored; bad API inputs → no stack traces or internals | 7 | PASS |
| Supabase REST denial and auth-token suite against the dev project | 7 | PASS: 46 passed, 3 skipped (placeholder tables) |
| CSP strictness evaluation (ADR-053): SRI + `script-src 'self'` | 7 | Not adoptable: 24 blocked inline scripts on `/`, pages stop hydrating. `'unsafe-inline'` kept (R-07 accepted) |
| CSP violation found by Lighthouse: Zod's `new Function` probe on pages with forms | 7 | FIXED: Zod runs jitless (`src/lib/validation/zod-setup.ts`); 0 CSP issues on `/menu`, `/feedback` |
| Missing favicon (404 on every page) | 7 | FIXED (`src/app/icon.svg`) |

| `npm audit`: next 16.0.0–16.4.0 critical (RCE via image optimizer SVG, RCE in `use cache` typed arrays, Server Actions DoS); fast-uri moderate | 7 R2A | FIXED: next 16.4.3, `npm audit fix` (ADR-057). `npm audit --omit=dev` = 0 |
| Review of an unofficial copy of the project (Downloads folder) before porting its UI | 7 R2A | NOT PORTED: forgeable `zorko-admin-session` cookie (raw admin ID, 7 days, bypassed Supabase Auth and session limits), raw-SQL password check against `auth.users`, a real admin password in `README-FOR-TEAM.md` (team told to rotate it), fake newsletter form (ADR-055) |
| Admin accounts after the unofficial copy (team report: login not working) | 7 R2A fix | Diagnosed read-only: both allowlisted accounts are valid Supabase users, but their passwords are rejected by Supabase Auth (one was only ever used through the unofficial copy's raw-SQL login). Both allowlist rows **disabled** on the team's request. New admin via dashboard + `admin:add`. Team to delete the 4 old users in Supabase → Authentication → Users |
