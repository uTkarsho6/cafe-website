# Phase 7 — Security hardening and full regression

**Status:** AWAITING TEAM VERIFICATION · Branch `phase-7` · 2026-10-16

## Gate summary
- **No unresolved critical or high finding** in the application.
- **Accepted residual risks:**
  - **R-07:** the CSP allows inline scripts (`'unsafe-inline'`).
  - **R-12:** the dev-only `braces` advisory, which is never shipped.
- **Release-blocking tests:** all pass (see the final results below).

## What was checked and what was found
| Area | Result |
|---|---|
| Dependencies (`npm audit`) | Production: **0 vulnerabilities**. All dependencies: 5 high, all in one dev-only ESLint tooling chain (`braces` ≤3.0.3; no fix released yet). Accepted as R-12. |
| Secrets in git history (gitleaks) | **No leaks.** |
| Secrets in the working tree (gitleaks) | 13 hits, all in git-ignored files: `.env.local` (your real keys, where they belong) and Next's build output `.next/` (its own per-build keys, server-side only). Nothing tracked. |
| Secrets in browser bundles | **0** of the env values found in `.next/static`. The name `SUPABASE_SECRET_KEY` appears only in the "uploads are switched off" message. |
| Risky code patterns | None in app code: no `dangerouslySetInnerHTML`, `eval` or hand-written SQL. Every new-tab link has `rel="noopener"`, and logs contain no secrets. |
| Authorization review | 15 admin pages and 26 admin Server Actions all call `requireAdmin()` first. This is now enforced by `tests/unit/authz-guard.test.ts`. |
| Attack replays against the real server | A captured admin action replayed **without a session**: refused, nothing changed. Replayed **with the admin's cookies from another site**: refused, nothing changed. The same request **from the site itself**: works. This positive control proves the refusals come from the Origin check. |
| Abuse | A 7 MB request is refused before anything is stored. Junk API input never shows stack traces or internals. Login and feedback rate limits were re-tested. |
| Supabase direct access (live dev project) | **PASS**: 46 passed, 3 skipped. Every table is denied through the REST API; forged and expired tokens are refused; signup is off. |
| Production configuration | A real production deploy refuses a localhost or http site URL. The dev style guide returns 404 in production. The demo seed refuses to run in production. `X-Powered-By` is off. A missing salt makes sign-in fail closed. |
| Content Security Policy (ADR-016, now ADR-053) | Tested a strict policy using Subresource Integrity (SRI): it blocks 24 of Next's inline scripts, so pages stop working. Kept `'unsafe-inline'` and documented why (R-07). Other protections stay in place: React escaping, no `dangerouslySetInnerHTML`, no eval, `object-src`/`base-uri`/`form-action`/`frame-ancestors` locked. |
| **Fixed: CSP violation** | Lighthouse found Zod probing `new Function()` on every page with a form. Zod now runs in jitless mode, and there are 0 CSP issues. |
| **Fixed: missing favicon** | Every page logged a 404. Added `src/app/icon.svg`. |
| **Added: missing regression tests** | TC-E2E-090 checks for no ordering, cart or coupon UI, and none of the forbidden mockup claims. TC-E2E-091 checks for no console errors or failed requests. Both run on 13 public pages in Chrome and Safari. |
| Session test made robust | Background link prefetches could refresh the activity cookie while the test was changing it. The test now leaves the page first. This was a test-timing issue, not a security one. |

## Lighthouse 13.5 (local production build)
| Page | Mobile (perf / a11y / best practices / SEO) | Desktop |
|---|---|---|
| Home | 89–91 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Menu | 93 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Dish page | 93 / 100 / 100 / 92 | 100 / 100 / 100 / 92 |
| Feedback | 88–96 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Offers, Contact, QR | 88–95 / 100 / 96* / 100 | 100 / 100 / 96* / 100 |

- **Machine load:** this Mac was under heavy load (load average 7.5–9), which costs mobile performance points. One mobile run of the menu failed to start for that reason and was repeated.
- **\*** The offers, contact and QR pages were measured only before the favicon fix. The favicon was the 4-point deduction on every other page.
- **Dish-page SEO 92:** a known false negative. Next streams the meta description to browsers and to Googlebot (which runs JavaScript), and sends it in `<head>` to Bing, Facebook, WhatsApp and similar bots (ADR-053).
- **Layout shift (CLS)** ≤ 0.054 everywhere; blocking time ≤ 280 ms on mobile.

## Final test results
| Suite | Result |
|---|---|
| `npm run check` (lint, typecheck, format, unit, build) | PASS: 302 unit/component tests |
| `npm run test:integration` | PASS: 103 |
| `npm run test:supabase` (live dev project) | PASS: 46 passed, 3 skipped |
| `npm run test:e2e -- --workers=2` (all projects, Chromium + WebKit) | **PASS: 312 passed, 0 failed, 25 skipped**. The skips are Chromium-only screenshot tests in WebKit, and the Storage upload tests (NOT RUN: Storage not configured). |

## Documentation updated
- SECURITY.md: risk register (R-02, R-04, R-07), OWASP Top 10:2025 and API Top 10:2023 statuses (now "Verified" with evidence), §11 Phase 7 results.
- DECISIONS.md: ADR-053.
- TRACEABILITY: NFR-001…004, 006, 008…010 and 012 marked Verified with evidence.

## HOW TO TEST THIS PHASE
1. Run every automated check:
   ```bash
   git switch phase-7
   npm ci
   npm run check
   npm run test:integration
   npm run test:supabase
   npm run test:e2e -- --workers=2
   ```
2. Start the app with `npm run dev`, then try these manual attacks on your own local copy only:
   1. **Open the admin without signing in.** In a private window, go to http://localhost:3000/admin/menu. You land on the login page.
   2. **Wrong password six times.** On the 6th attempt you get "Too many sign-in attempts".
   3. **Script injection.** At `/feedback`, send `<img src=x onerror=alert(1)>` plus some text, then approve it in the admin. The home page shows the text literally, and no alert pops up.
   4. **Dangerous banner link.** In Admin → Banners, open a banner and set the button link to `javascript:alert(1)`. It is refused.
   5. **Edited cookie.** Sign in, then in DevTools → Application → Cookies, change one character of `zorko_admin_activity` and reload. You are signed out with "Your session expired".
   6. **Direct database access.** Run `npm run test:supabase`. All REST access is denied.
3. **Read** SECURITY.md §7 (risks) and §11 (evidence). Please confirm you accept R-07 and R-12.

**Not bugs:**
- Mobile Lighthouse scores vary with machine load.
- The dish page's SEO score of 92 is explained above.
- Image uploads stay off until Storage is configured.

**If something fails:** send the command output, a screenshot, and any browser console error.

Phase 7 complete. Waiting for your approval or bug reports before starting Phase 8. To approve, reply exactly: approved, go to Phase 8
