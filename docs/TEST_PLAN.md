# TEST PLAN

**Version:** 1.0 (Phase 1), 2026-10-13. Test IDs are referenced from TRACEABILITY.md and SECURITY.md.

## 1. Strategy and pyramid

| Level | Tool | Scope | Runs |
|---|---|---|---|
| Unit | Vitest | Pure logic: formatting, offer status, open-now, filter → Prisma `where` builder, Zod schemas, `safeHref`, env validation | Every commit (`npm test`) |
| Component | Vitest + React Testing Library (jsdom) | UI primitives and feature components: states, a11y roles, no ordering controls | Every commit |
| Integration | Vitest (node) against the **development** Supabase DB (or a local Postgres in Docker for CI) | Services + Prisma: constraints, filters, pagination, transactions, authorization helpers, rate limiter, API route handlers | `npm run test:int` (Phase 3+) |
| E2E | Playwright (Chromium + WebKit) against `next build && next start` with seeded data | User journeys, admin flows, freshness ≤30 s, responsive widths, axe, visual baselines | `npm run test:e2e` (Phase 4A+) |
| Security | Vitest + Playwright + scripts | Section 9.10 cases; Supabase REST denial; bundle and secret scans | `npm run test:security` (Phase 3+, full in 7) |
| Performance | Lighthouse CLI on a production build | Home, menu, item | Phase 7 |

**Test data:**
- A deterministic seed (`ALLOW_DEMO_SEED=true`): 8 categories, ~40 items (including 3 unavailable and items exactly at ₹99/₹100/₹200/₹201), 4 combos (ACTIVE), 1 SCHEDULED, 1 EXPIRED, 2 student offers, 2 banners, 6 gallery images, feedback in all three statuses (including XSS payload text), and complete café info with hours.
- Local generated images only.
- Test admins are created by the test setup in the **development** project (an allowlisted admin and a non-allowlisted user) and removed afterwards. Real customer data and production credentials are never used.

**Determinism:**
- Tests that depend on time inject "now" (offer status, open-now).
- Visual tests freeze time, disable animations, and use the seeded images.

## 2. Phase entry and exit criteria

- **Entry:** previous phase approved (PROGRESS.md); all earlier tests green.
- **Exit:** all tests of this phase and earlier phases PASS (or BLOCKED with a reason); lint and typecheck clean; build succeeds; report written.

## 3. Defect severity

| Severity | Definition | Release rule |
|---|---|---|
| Critical | Security breach (auth bypass, data exposure, secret leak), data loss, site down | Must fix before phase approval |
| High | Must-have feature broken, wrong price/availability shown, accessibility blocker on a main journey | Fix before phase approval, or an approved mitigation |
| Medium | Should-have broken, layout defect at one width, non-blocking a11y issue | Fix or backlog with team agreement |
| Low | Cosmetic | Backlog |

**Regression rule:** every fixed bug gets a test that failed before the fix. The full suite of all earlier phases is re-run before every handover.

## 4. Test cases

### 4.1 Unit (TC-UNIT)

| ID | Case | Expected |
|---|---|---|
| TC-UNIT-001 | `formatRupees(14900)` | `"₹149"`; `formatRupees(14950)` → `"₹149.50"` |
| TC-UNIT-002 | Env validation with a missing `DATABASE_URL` | Throws naming the variable, without printing values |
| TC-UNIT-003 | Env validation in production with `NEXT_PUBLIC_SITE_URL=http://localhost:3000` | Throws |
| TC-UNIT-010 | `menuQuerySchema` parses valid/invalid params (`pageSize=500`, `q` of 61 characters, `sort=evil`) | Caps or rejects per TRD §6 |
| TC-UNIT-011 | Filter builder combines q + category + price + popular + offers | `where` has all conditions with AND |
| TC-UNIT-012 | Price band boundaries: ₹99.99 / ₹100 / ₹200 / ₹200.01 | Under100 / 100–200 / 100–200 / 200+ |
| TC-UNIT-013 | `escapeLike` escapes `%`, `_`, `\` in search | Matched literally |
| TC-UNIT-020 | `offerStatus` for now < start, start ≤ now < end, now ≥ end, expiredAt set, IST midnight edge | SCHEDULED / ACTIVE / EXPIRED / EXPIRED / correct |
| TC-UNIT-021 | Combo savings: regular sum − promo; % rounded down; promo ≥ regular | Correct values; no savings badge when ≤0 |
| TC-UNIT-022 | `isOpenNow` for open, closed, a closed day, boundary minutes (IST) | Correct |
| TC-UNIT-030 | QR target built from the site URL; localhost rejected in production | `https://x/menu?src=qr`; error |
| TC-UNIT-031 | `pageMetadata()`: canonical, Open Graph/Twitter fields, page image or default share image, absolute titles | All fields present; `/og-default.jpg` when no image |
| TC-UNIT-040 | `safeHref`: `/menu`, `https://a.b`, `//evil.com`, `javascript:alert(1)`, `data:…`, ` JaVaScRiPt:` | ok, ok, reject, reject, reject, reject |
| TC-UNIT-041 | Social URL validator (Instagram/Facebook host + https) | Only matching https hosts accepted |
| TC-UNIT-042 | Safe `next` redirect: `/admin/menu` ok; `//evil`, `https://evil`, `/\evil` rejected | Correct |
| TC-UNIT-050 | Feedback schema: lengths, honeypot non-empty, unknown field | Rejects as specified |
| TC-UNIT-060 | Image magic-byte sniffer: JPEG/PNG/WebP headers; HTML, SVG, GIF, empty | Accept the first 3; reject the others |

Added in Phase 3:

| ID | Case | Expected |
|---|---|---|
| TC-UNIT-070 | Seed guard: no `ALLOW_DEMO_SEED`, `=1`, production `NODE_ENV`/`VERCEL_ENV`, missing URL | Refused with reason |
| TC-UNIT-071 | `mediaUrl`: demo and `photos/` paths, storage path, traversal, sub-folders, absolute/external URL, SVG, Storage unconfigured | Local/bucket URL or null |
| TC-UNIT-121 | Category thumbnails (ADR-060): every mapped file exists, all 16 real categories have one, unmapped slugs fall back to the icon | Pass |
| TC-UNIT-122 | Table QR cards (ADR-061): tables 1–20, `table=N` added to the menu URL, strict table-number parsing (`0`, `21`, `05`, `1.5`, `1e1` refused) | Pass |
| TC-UNIT-123 | Quick-edit actions (ADR-061): require an admin; bad prices, non-label flags (`isArchived`, `isDemo`, `__proto__`…), non-boolean values and forged IDs refused before any write; `149.50` → 14950 paise | Pass |
| TC-UNIT-120 | Outlet photo list (ADR-056): every file exists in `public/`, resolves locally, alt text and caption fit the schema, no duplicates | Pass |
| TC-UNIT-080 | Error mapping: Prisma P2002/P2025/P2003/P1001/unknown, Zod, ApiError | 409/404/409/503/500/400; no internal text |

Added in Phase 5B:

| ID | Case | Expected |
|---|---|---|
| TC-UNIT-090 | Admin menu schemas: rupees → paise (`149.5` → 14950; `-1`, `1.999`, `1e3`, `0` for items rejected); slugify; item/category fields dropped; add-on rules (min ≤ max ≤ options, ≤10 groups, strict keys); relation limits; list-query fallbacks | As specified (`tests/unit/admin-menu-validation.test.ts`) |
| TC-UNIT-091 | Every exported menu Server Action calls `requireAdmin()` first and writes nothing when refused; forged IDs/booleans rejected; delete succeeds when Storage cleanup fails | Pass (`tests/unit/admin-menu-actions.test.ts`) |
| TC-INT-090 | Menu admin service on Postgres: unique slugs, stable slug on rename, price/availability visible to the public service, archive hides / restore shows, delete guards (archived, not in an offer), add-ons replace atomically, relations (no self, unknown → rollback), images (replace in place, IDOR-scoped removal, max 4, reorder, free slot reuse), categories (archive hides items, delete only when empty) | Pass (`tests/integration/admin-menu.test.ts`) |

Added in Phase 5C:

| ID | Case | Expected |
|---|---|---|
| TC-UNIT-092 | Content schemas: safe links (internal/http(s) only; `javascript:`, `data:`, `//host`, backslash, credentials, control chars refused), social hosts, IST date parsing, offer rules (kind/price/dates/items), banner button pairs and window, café fields, hours (closing after opening, 00:00 = midnight), gallery alt text | As specified (`tests/unit/admin-content-validation.test.ts`) |
| TC-UNIT-093 | Every 5C Server Action calls `requireAdmin()` first; forged IDs/values refused; `javascript:` banner refused before any upload; delete works when Storage cleanup fails | Pass (`tests/unit/admin-content-actions.test.ts`) |
| TC-INT-091 | 5C services on Postgres: offer states (draft/scheduled/active/expired), unique stable slug, item replace + rollback, expire/reactivate rules, delete keeps menu items; banner window and image replacement; café + 7-day hours shown by the public service; gallery publish/order/delete | Pass (`tests/integration/admin-content.test.ts`) |

Added in Phase 6:

| ID | Case | Expected |
|---|---|---|
| TC-UNIT-094 | Feedback schema (lengths, control/zero-width/bidi characters removed, HTML kept as text, unknown fields dropped); QR target = configured URL, decoded payload equals it, SVG/PNG valid, localhost/LAN/http warnings; moderation actions require an admin; public action: pending only, honeypot, rate limit, generic DB error | Pass (`tests/unit/feedback-qr.test.ts`) |
| TC-INT-040/041 | Feedback on Postgres: pending → not public; approve → public text (XSS stored as text); reject → hidden; delete; "Guest" fallback; 3/10 min limit per IP; 90-day purge of rejected feedback | Pass (`tests/integration/feedback.test.ts`) |
| TC-E2E-042/043/044/073 | `/qr` image + downloads + destination opens the menu; feedback submit, validation, honeypot, 4th submission refused; approve → home shows payload as text (not executed) → reject hides → delete; admin QR warnings; axe + overflow; baselines | Pass (`tests/e2e/admin-feedback.spec.ts`) |

Added in Phase 7:

| ID | Case | Expected |
|---|---|---|
| TC-SEC-031 (static) | Every admin page and exported admin Server Action awaits `requireAdmin()` before anything else | Pass (`tests/unit/authz-guard.test.ts`) |
| TC-SEC-001/090 (live) | Captured admin action replayed without a session, and with the admin's cookies from a foreign Origin; positive control from the own origin | Refused, refused, works (`tests/e2e/security.spec.ts`) |
| TC-SEC-011 | 7 MB Server Action body | Refused, nothing stored |
| TC-SEC-120 | Junk API inputs (negative page, quote injection, path traversal, 5000-char slug, bad QR format) | <500 status, no stack traces or internals |
| TC-E2E-090 | No ordering/cart/coupon UI and none of the CLAUDE.md §6.2/§6.3 mockup claims on 13 public pages | Pass (`tests/e2e/regression.spec.ts`, both engines) |
| TC-E2E-091 | No console errors, page errors or failed same-origin requests on the same 13 pages | Pass |
| TC-E2E-092 | Header shows the official logo (image loads); footer and phone "More" sheet "Staff portal" open only the sign-in page (ADR-055) | Pass |

Added in Phase 4A: menu URL state (invalid values dropped, hrefs keep filters, chips), navigation gating (`liveNav`, `isActivePath`), 12-hour time formatting, price-band `where` clauses (TC-UNIT-012), in `tests/unit/menu-page.test.ts`. Menu card states (TC-COMP-002) in `tests/component/menu-card.test.tsx`.

### 4.2 Component (TC-COMP)

| ID | Case | Expected |
|---|---|---|
| TC-COMP-001 | Button variants render; disabled has `aria-disabled`; loading has `aria-busy` | Pass |
| TC-COMP-002 | MenuCard available vs unavailable | Unavailable shows "Out of stock", is never "Available", has grayscale class |
| TC-COMP-003 | MenuCard with an active discount | Struck-through regular price + promo price |
| TC-COMP-004 | VegMark hidden "100% VEG" pill when `isPureVegConfirmed=false` | No pill |
| TC-COMP-005 | EmptyState in the menu has a "Clear all filters" action | Calls reset |
| TC-COMP-006 | Dialog traps focus, closes on Esc, restores focus (**E2E**: jsdom has no `showModal`) | Pass |
| TC-COMP-007 | AddOnList renders groups read-only (no inputs) | No `input`/`button` in the list |
| TC-COMP-008 | ReviewCard renders `<script>` text literally | Escaped text, no element |
| TC-COMP-009 | Pagination marks the current page with `aria-current` | Pass |
| TC-COMP-010 | Gallery lightbox: open a tile, previous/next buttons, ←/→ keys wrap, caption falls back to alt text | Correct photo and "Photo N of M" after each step |
| TC-COMP-020 | Inline price field: saves on Enter, no call when unchanged, Escape restores, server error shown and linked with `aria-describedby` | Pass |
| TC-COMP-021 | Label toggles: `aria-pressed` state, one click saves, reverts when the server refuses | Pass |

### 4.3 Integration (TC-INT) — dev DB / local Postgres

| ID | Case | Expected |
|---|---|---|
| TC-INT-001 | Unique slug violation on item create | 409 mapped error |
| TC-INT-002 | Price ≤0, endsAt ≤ startsAt, lat 91 | Rejected (Zod and DB CHECK) |
| TC-INT-003 | Delete a category with items | Blocked (Restrict) → 409 |
| TC-INT-004 | Other CHECKs: offer price vs kind (incl. NULL), café lat/lng/WhatsApp/singleton, hours ranges, self-relation, 5th image, add-on min>max, combo qty 21, item in offer cannot be deleted | Rejected by the DB |
| TC-INT-010 | `GET /api/v1/menu` combined filters on seed | Only items matching all filters; meta correct |
| TC-INT-011 | Pagination: page 1/2/last/out-of-range; pageSize cap | Correct slices; empty data on out-of-range; 400 on pageSize>48 |
| TC-INT-012 | Archived/unpublished items and archived categories | Never returned publicly |
| TC-INT-013 | Sorting stable with ties | Deterministic order |
| TC-INT-020 | `GET /api/v1/menu/[slug]` unknown/archived | 404 `NOT_FOUND` shape |
| TC-INT-021 | Item details include related, FBT and combos | Only published/active ones |
| TC-INT-030 | `GET /api/v1/offers` | Active + scheduled; never expired; `offers/[slug]` expired → 404 |
| TC-INT-031 | `GET /api/v1/cafe` | 7 hours rows, `verified` flags, `openNow`, no internal id |
| TC-INT-040 | `GET /api/v1/reviews` | APPROVED only |
| TC-INT-041 | `POST /api/v1/feedback` valid | 201, stored PENDING |
| TC-INT-042 | Café map/directions (ADR-046): Google Maps place > coordinates > verified address; unverified address never sent | `mapQuery`/`directionsUrl` as specified, URL-encoded; null when unverified |
| TC-INT-050 | Response contracts (Zod-validated in the test) for every public endpoint | Match TRD §6 |
| TC-INT-060 | Rate limiter: N allowed, N+1 → limited; window reset; concurrent increments | Correct counts under concurrency |
| TC-INT-061 | Audit entries: admin name, trimmed and length-capped summary, newest first | Correct entry; summary ≤300 chars |
| TC-INT-062 | Dashboard counts equal database counts (public items, available, active/scheduled offers, pending feedback, photos) | Matches the fixtures |
| TC-INT-070 | Admin service transactions (add-on save replaces groups atomically; failure rolls back) | No partial writes |
| TC-INT-071 | Audit entry written with every admin mutation | Present, no secrets |
| TC-ADM-011 | Quick edits (ADR-061): inline price and label toggles persist and show publicly; missing item refused; DB CHECK rejects ₹0 | Pass |
| TC-INT-080 | `/api/health` with DB up/down (mock) | 200 ok / 503 down, no internals |

### 4.4 Security (TC-SEC)

| ID | Case | Expected |
|---|---|---|
| TC-SEC-001 | Anonymous call to each admin action and `/api/admin/*` | 401 / redirect; no change in DB |
| TC-SEC-002 | Authenticated **non-allowlisted** user calls each admin action | 403; no change |
| TC-SEC-003 | Forged JWT cookie (bad signature) | Treated as anonymous |
| TC-SEC-004 | Expired JWT cookie | Treated as anonymous / session-expired flow |
| TC-SEC-005 | Inactive `AdminUser` | 403 |
| TC-SEC-006 | Signup attempt via Supabase Auth API on the dev project | Rejected (signup disabled) |
| TC-SEC-007 | Session cookie flags | HttpOnly, SameSite=Lax, Secure (production build over https/preview) |
| TC-SEC-008 | Login rate limit (6th attempt in the window) | Blocked with a generic message |
| TC-SEC-009 | Logout then reuse the old cookie | Not authorised |
| TC-SEC-020 | Supabase REST `GET/POST/PATCH/DELETE /rest/v1/<each table>` with the publishable key (and with an authenticated user token) | No rows / permission denied; no write succeeds |
| TC-SEC-022 | RLS at DB level (local Postgres with Supabase roles): RLS on every `public` table, no policies; `anon`/`authenticated` SELECT/DELETE/INSERT | `permission denied` everywhere; fails if a new table lacks RLS |
| TC-SEC-021 | Storage upload to `public-media` with the publishable key | Denied |
| TC-SEC-030 | Mass assignment: extra fields (`id`, `isArchived`, `createdAt`, `adminUserId`, `status`) in action/API payloads | API: 400 rejected. Server Action forms: extra fields dropped, never written (forms carry Next's `$ACTION_*` fields; ADR-049); JSON payloads (add-ons): rejected |
| TC-SEC-031 | Role escalation: client sends `isAdmin`/`role` fields or a different `authUserId` | Ignored/rejected; no escalation |
| TC-SEC-040 | XSS payloads in feedback (`<script>`, `<img onerror>`, `"><svg onload>`) shown after approval | Rendered as text; no dialog fires (Playwright) |
| TC-SEC-041 | XSS payloads in admin text fields (item name, banner title, about text) | Rendered as text |
| TC-SEC-050 | Banner/social URL `javascript:`, `data:`, `//evil` | Rejected by server |
| TC-SEC-051 | Login `next=//evil.com` and `https://evil.com` | Redirects to `/admin` only |
| TC-SEC-060 | Upload HTML renamed `.jpg` with `image/jpeg` MIME | 415 |
| TC-SEC-061 | Upload SVG | 415 |
| TC-SEC-062 | Upload >5 MB | 413 |
| TC-SEC-063 | Upload truncated/corrupt JPEG | 400/415 |
| TC-SEC-064 | Upload JPEG with GPS EXIF | Stored WebP has no EXIF; filename is a generated UUID |

Phase 5B note: uploads go through a Server Action, so TC-SEC-060…063 are refused with a clear message in the form instead of an HTTP status. Covered in `tests/unit/image-upload.test.ts`. E2E repeats TC-SEC-060 once Storage is configured.
| TC-SEC-070 | Feedback flood (4 in 10 min); honeypot filled | 429; honeypot silently dropped (201 without storing, or 400, as documented) |
| TC-SEC-080 | Cross-origin POST to feedback/uploads/logout (bad `Origin`) | 403 `BAD_ORIGIN` |
| TC-SEC-081 | Server Action invoked with a foreign `Origin` | Rejected by Next |
| TC-SEC-090 | Injection strings in `q` (`' OR 1=1 --`, `%`, `_`, `\`) | Literal search; no error; no extra rows |
| TC-SEC-091 | Oversized JSON body (>8 KB) to feedback | 413 |
| TC-SEC-100 | Client bundle scan (`.next/static`) for secret names and values (`SUPABASE_SECRET_KEY`, `DATABASE_URL`, `postgres://`, `sb_secret_`) | None found |
| TC-SEC-101 | gitleaks on the repo history | No findings |
| TC-SEC-102 | `npm audit --omit=dev` | No high/critical (or documented exception) |
| TC-SEC-110 | Security headers present on `/` and `/admin` | CSP, XFO/frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy, HSTS (production) |
| TC-SEC-111 | No `Access-Control-Allow-Origin` on API responses | Absent |
| TC-SEC-120 | Production config check script: missing env, http site URL, `ALLOW_DEMO_SEED` set | Fails with a clear message |
| TC-SEC-121 | Seed refuses in production / without `ALLOW_DEMO_SEED` | Exits non-zero, no writes |
| TC-SEC-130 | Logs contain no cookies, tokens or passwords during the login and feedback tests | grep of captured logs is clean |

### 4.5 E2E (TC-E2E) — Playwright

| ID | Case | Expected |
|---|---|---|
| TC-E2E-001 | Home renders every section from seed; CTAs go to `/menu` and `/offers` | Pass |
| TC-E2E-010 | Menu: search "burger" + category + 100–200 band + popular | Only matching cards; URL updated; count text correct |
| TC-E2E-011 | Menu: no matches → empty state → "Clear all" restores the full list | Pass |
| TC-E2E-012 | Menu: sort price ascending/descending; pagination next/prev | Correct order/pages |
| TC-E2E-013 | Menu: API failure (route intercepted) → error state → "Try again" | Recovers |
| TC-E2E-014 | Menu mobile: filter sheet apply/reset; category pills scroll | Pass |
| TC-E2E-020 | Item details: images/thumbnails, add-ons read-only, related links, back keeps filters | Pass |
| TC-E2E-021 | Unavailable item shows "Out of stock" on card and details | Pass |
| TC-E2E-030 | Offers: active shown, scheduled under "Coming soon", expired absent; tabs filter | Pass |
| TC-E2E-031 | Student Zone shows only student offers + disclaimer | Pass |
| TC-E2E-040 | Gallery lightbox keyboard (arrows, Esc, focus restore) | Pass |
| TC-E2E-041 | Contact: tel/mailto/wa.me/social links have valid hrefs; map iframe has a title; directions link | Pass |
| TC-E2E-042 | Feedback submit → success; appears publicly only after admin approval | Pass |
| TC-E2E-043 | QR page: decode the rendered QR (jsQR in test) equals `${SITE_URL}/menu?src=qr`; PNG/SVG download; table code `table=12` downloads as `zorko-sangli-table-12-qr.png`, invalid tables → 400; admin page shows 20 table cards with downloads and Print all (signed-in part needs test accounts) | Pass |
| TC-E2E-044 | Visiting the QR target URL on a mobile viewport opens the menu with no login | Pass |
| TC-E2E-045 | SEO: title/description/canonical/OG/Twitter tags; noindex on missing pages; sitemap and robots.txt | Tags present; sitemap has only visible content and every URL resolves |
| TC-E2E-050 | **Freshness:** admin toggles availability → public item page reflects it within ≤30 s (poll every 2 s) | Pass with measured seconds recorded |
| TC-E2E-051 | Admin price change visible publicly ≤30 s | Pass |
| TC-E2E-060 | Admin login/logout; protected URL redirects when logged out | Pass |
| TC-E2E-061 | Non-allowlisted user login refused with a generic message | Pass |
| TC-E2E-062 | Session expiry (cookie cleared mid-session) → toast + redirect to login with `next` | Pass |
| TC-E2E-070 | Admin CRUD: category, item (with image upload), add-ons, relations, archive → persists after reload | Pass |
| TC-E2E-071 | Admin offers: create combo (scheduled → active by dates), expire now | Public state follows |
| TC-E2E-072 | Admin banners with an internal link; café info and hours edit; gallery upload/order/publish | Public pages updated |
| TC-E2E-073 | Feedback moderation approve/reject/delete with confirm dialogs | Pass |
| TC-E2E-074 | Dashboard counts equal DB counts | Pass |
| TC-E2E-075 | Audit log lists the actions above | Pass |
| TC-E2E-090 | **No ordering UI:** no "Add to order", "ADD", cart, checkout, coupon copy, "Table QR Order" text on any public page | None found |
| TC-E2E-091 | No console errors or failed requests on all public pages | Pass |

### 4.6 Accessibility (TC-A11Y)

| ID | Case | Expected |
|---|---|---|
| TC-A11Y-001 | axe on every public page (desktop and mobile) | 0 serious/critical |
| TC-A11Y-002 | axe on admin login, dashboard, menu list, item editor, offers, feedback | 0 serious/critical |
| TC-A11Y-003 | Keyboard-only: menu filter + open item; feedback submit; admin toggle availability | Completable; focus visible |
| TC-A11Y-004 | Form errors announced (`aria-invalid`, `aria-describedby`, live region) | Pass |
| TC-A11Y-005 | `prefers-reduced-motion: reduce` disables transforms/pulse | Computed styles show no animation |
| TC-A11Y-006 | Manual: screen-reader smoke test (VoiceOver) on home and menu | Recorded in the phase report |

### 4.7 Responsive and visual (TC-RESP / TC-VIS)

| ID | Case | Expected |
|---|---|---|
| TC-RESP-001 | Every page at 375/430/768/1024/1440: `scrollWidth ≤ innerWidth` | No horizontal scroll |
| TC-RESP-002 | Touch targets ≥48 px under 1024 on interactive elements (bounding boxes) | Pass |
| TC-RESP-003 | Nav reachable at each width (desktop nav / drawer / bottom nav) | Pass |
| TC-RESP-004 | Admin tables usable at 375 (stacked cards) | Pass |
| TC-VIS-001…022 | Screenshot baselines (desktop 1440 + mobile 390): home, menu, item, offers, student zone, contact, gallery, admin login, dashboard, menu management, offer management, feedback moderation | Comparisons run; diffs reviewed |
| TC-VIS-100 | Side-by-side check of our desktop home/menu/item/offers vs `design/reference/*` | Manual review notes in the phase report (not pixel-perfect claims) |

### 4.8 Performance (TC-PERF)

| ID | Case | Expected |
|---|---|---|
| TC-PERF-001 | Lighthouse mobile on `/`, `/menu`, `/menu/[slug]` (production build) | Targets in NFR-003; measured numbers only |
| TC-PERF-002 | Query count per menu request (Prisma query log in test) | ≤3 queries; no N+1 |

## 5. Commands (from Phase 2 on)

Notes from Phase 2:
- E2E runs `npm run build && next start -p 3100` automatically with `ENABLE_STYLEGUIDE=true`.
- Keyboard tests press **Option+Tab in WebKit**: Safari moves Tab only between form fields by default.


```
npm run check             # lint + typecheck + format + unit/component + build
npm test                  # Vitest unit + component (no DB)
npm run test:integration  # Docker test DB (recreated, migrated, seeded) + Vitest integration
npm run test:e2e          # Docker test DB + Playwright (builds + starts app), Chromium + WebKit
npm run test:supabase     # TC-SEC-020 against the DEV Supabase project (needs URL + publishable key)
npm run test:db:down      # remove the test container
```
Phase 4A notes: `tests/e2e/public-site.spec.ts` covers the homepage, menu, item pages, internal-link validation, axe at 390/1440 px, no horizontal scroll at all five widths, touch targets, header/drawer/bottom nav and **visual baselines** (Chromium, `tests/e2e/public-site.spec.ts-snapshots/`; time-dependent text masked via `[data-volatile]`). Update baselines only for reviewed design changes: `npx playwright test -g "visual baselines" --update-snapshots`.

Phase 3 notes: integration and E2E need Docker Desktop running. `test:supabase` reports "skipped" (= NOT RUN) when the keys are missing; it never passes without running.
