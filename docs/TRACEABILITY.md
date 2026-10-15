# TRACEABILITY

Requirement → design/module → implementation location (planned) → tests → phase → status → evidence.

**Status values:** Planned · In progress · Implemented (code exists, not verified) · Verified (tests passed; evidence linked). A Must-have may be marked Verified only with passing tests recorded in a phase report.

| Req | Pri | Design / module | Implementation (planned) | Tests | Phase | Status | Evidence |
|---|---|---|---|---|---|---|---|
| FR-001 Homepage | M | UI_SPEC §12.1; services home/menu/offers/cafe | `src/app/(public)/page.tsx`, `src/server/services/home.ts` | TC-E2E-001, TC-VIS-001, TC-A11Y-001 | 4A, 4B | In progress (4A + 4B verified: hero with fixed burger photo, offers/Student Zone CTAs, map + directions; banner/review/gallery data comes with 5C/6) | phase-4a.md, phase-4b.md |
| FR-002 Navigation | M | UI_SPEC §8 | `src/components/layout/*`, `src/lib/site/nav.ts` | TC-RESP-003, TC-A11Y-003 | 4A, 4B | In progress (all 6 public pages live and verified in header, drawer, bottom nav + More sheet, footer; Feedback/QR switch on in 6, ADR-042) | phase-4b.md |
| FR-003 Menu listing | M | UI_SPEC §12.2; TRD §6 | `src/app/(public)/menu/page.tsx`, `services/menu.ts` | TC-INT-010, TC-INT-012, TC-E2E-010 | 3, 4A | Verified | phase-3.md, phase-4a.md |
| FR-004 Search | M | ADR-012 | `lib/validation/public.ts`, `services/menu.ts` | TC-UNIT-010/011, TC-SEC-090, TC-E2E-010 | 3, 4A | Verified | phase-3.md, phase-4a.md |
| FR-005 Combined filters | M | ADR-021, ADR-022 | same | TC-UNIT-011/012, TC-INT-010, TC-E2E-010 | 3, 4A | Verified | phase-3.md, phase-4a.md |
| FR-006 Sort & reset | M | UI_SPEC §12.2 | same + `features/menu/SortSelect` | TC-INT-013, TC-E2E-011/012 | 3, 4A | Verified | phase-3.md, phase-4a.md |
| FR-007 Pagination | M | TRD §4 | same + `ui/Pagination` | TC-INT-011, TC-E2E-012 | 3, 4A | Verified | phase-3.md, phase-4a.md |
| FR-008 List states | M | UI_SPEC §7.7 | `menu/loading.tsx`, `error.tsx`, `EmptyState` | TC-COMP-005, TC-E2E-011/013 | 4A | Verified (loading skeletons, empty state, error boundary) | phase-4a.md |
| FR-009 Availability display | M | UI_SPEC §7.6 | `features/menu/MenuCard` | TC-COMP-002, TC-E2E-021 | 4A | Verified | phase-4a.md |
| FR-010 Item details | M | UI_SPEC §12.3 | `src/app/(public)/menu/[slug]/page.tsx` | TC-INT-020, TC-E2E-020 | 3, 4A | Verified | phase-3.md, phase-4a.md |
| FR-011 Add-ons display | M | ADR-019 | `features/menu/AddOnList` | TC-COMP-007, TC-E2E-020 | 4A | Verified | phase-4a.md |
| FR-012 Related / FBT / combos | M | TRD §4 ItemRelation | `services/menu.ts#getItemDetail` | TC-INT-021, TC-E2E-020 | 3, 4A | Verified | phase-3.md, phase-4a.md |
| FR-013 Best sellers / trending | M | ADR-021 | flags + home section | TC-INT-010, TC-E2E-001 | 3, 4A | Verified | phase-3.md, phase-4a.md |
| FR-014 Offers & combos | M | ADR-020; UI_SPEC §12.4–12.5 | `src/app/(public)/offers/*`, `src/features/offers/offer-cards.tsx`, `services/offers.ts` | TC-UNIT-020/021, TC-INT-030, TC-E2E-030, TC-VIS | 3, 4B | Verified (active / scheduled / expired / draft; tabs; details; not-found) | phase-3.md, phase-4b.md |
| FR-015 Student Zone | M | UI_SPEC §12.6 | `src/app/(public)/student-zone/page.tsx` | TC-E2E-031, TC-VIS | 4B | Verified (student offers only; no-verification notice; no ID check) | phase-4b.md |
| FR-016 Gallery | M | UI_SPEC §12.7 | `src/app/(public)/gallery/page.tsx`, `src/features/gallery/gallery-grid.tsx` | TC-COMP-010, TC-E2E-040 (empty state), TC-VIS | 4B, 5C | In progress (page, lightbox and empty state verified; photos arrive with admin uploads in 5C, then the lightbox gets an E2E run) | phase-4b.md |
| FR-017 Café info & location | M | UI_SPEC §12.8; ADR-017, ADR-046 | `src/app/(public)/contact/page.tsx`, `services/cafe.ts`, `features/cafe/*` | TC-UNIT-022, TC-INT-042, TC-E2E-041, TC-VIS | 3, 4B | Verified (address, phone, map + directions to the Cafe Zorko listing, hours with today highlighted, unconfirmed values labelled) | phase-4b.md |
| FR-018 QR menu | M | ADR-018 | `src/app/(public)/qr/page.tsx`, `server/qr.ts` | TC-UNIT-030, TC-E2E-043/044 | 6 | Planned | — |
| FR-019 Feedback submission | M | UI_SPEC §12.9; ADR-014/026 | `src/app/api/v1/feedback/route.ts`, `features/feedback/FeedbackForm` | TC-UNIT-050, TC-INT-041, TC-SEC-070/080/091, TC-E2E-042 | 6 | Planned | — |
| FR-020 Public reviews | M | — | `services/feedback.ts#listApproved` | TC-INT-040, TC-SEC-040, TC-COMP-008 | 3, 6 | In progress (Feedback table, status + index in Phase 3; reviews API and UI in 6) | phase-3.md |
| FR-021 SEO | M | ADR-047 | `src/lib/site/seo.ts`, `generateMetadata`, `src/app/sitemap.ts`, `src/app/robots.ts` | TC-UNIT-031, TC-E2E-045 | 4B | Verified | phase-4b.md |
| FR-022 Live availability ≤30 s | M | ADR-013 | `server/revalidate.ts` + page revalidate | TC-E2E-050/051 | 5B | Planned | — |
| FR-023 Structured data | C | — | — | — | after Q-01…04 | Planned | — |
| FR-024 Demo labelling | M | ADR-025 | `layout/DemoRibbon`, `isDemo` | TC-E2E-001 | 3, 4A | Verified | phase-3.md, phase-4a.md |
| FR-025 Error pages | M | UI_SPEC §12.11 | `src/app/not-found.tsx`, `error.tsx`, `global-error.tsx` | E2E foundation "unknown routes return 404", axe on 404 | 2, 4A | Implemented (404 verified; per-page error states in 4A) | phase-2.md |
| FR-030 Admin login/logout | M | TRD §5; ADR-048 | `src/app/(admin)/admin/login/page.tsx`, `src/features/admin/{actions,login-form}.tsx` | TC-E2E-060/061, TC-SEC-009, TC-SEC-051 | 5A | Verified (Round 2: signed-in E2E in two engines, Supabase checks incl. signup disabled) | phase-5a.md |
| FR-031 Allowlist authorization | M | ADR-010, ADR-048 | `src/server/auth/admin.ts`, `src/proxy.ts`, `prisma/admin-allowlist.ts` | TC-SEC-001…006, TC-SEC-031 | 5A | Verified (Round 2: signed-in E2E in two engines, Supabase checks incl. signup disabled) | phase-5a.md |
| FR-032 Login protection & expiry | M | ADR-014, ADR-048 | `src/server/rate-limit.ts`, login action, proxy `expired=1` | TC-INT-060, TC-SEC-008, TC-E2E-062 | 5A | Verified (rate limits incl. concurrency; HMAC keys; session-expired notice) | phase-5a.md |
| FR-033 Dashboard | M | UI_SPEC §13 | `src/app/(admin)/admin/(shell)/{layout,page}.tsx`, `services/dashboard.ts`, `server/audit.ts` | TC-INT-061/062, TC-E2E-060 | 5A | Verified (Round 2: signed-in E2E in two engines, Supabase checks incl. signup disabled) | phase-5a.md |
| FR-034 Categories | M | ADR-049 | `admin/(shell)/categories/page.tsx`, `features/admin/menu/category-manager.tsx`, `services/admin-menu.ts` | TC-INT-090, TC-E2E-070 | 5B | Verified (create/edit/archive/restore; delete only archived + empty; slug generated, ADR-049) | phase-5b.md |
| FR-035 Menu items | M | ADR-049 | `admin/(shell)/menu/**`, `features/admin/menu-actions.ts`, `services/admin-menu.ts`, `lib/validation/admin-menu.ts` | TC-UNIT-090/091, TC-INT-090, TC-SEC-030/031, TC-E2E-070 | 5B | Verified | phase-5b.md |
| FR-036 Availability toggle | M | ADR-013, ADR-049 | `setAvailabilityAction`, `AvailabilityToggle` | TC-INT-090, TC-E2E-050 | 5B | Verified (list switch + editor; public within 10 s) | phase-5b.md |
| FR-037 Item images | M | ADR-015, ADR-049 | `server/media/{image-upload,storage}.ts`, `uploadItemImageAction`, `ImagesPanel` | TC-UNIT-060, TC-SEC-060…064, TC-INT-090, TC-E2E-070 (upload part) | 5B | Partly verified: validation, re-encoding, rows, reorder verified; real Storage upload NOT RUN (needs `SUPABASE_SECRET_KEY` + bucket) | phase-5b.md |
| FR-038 Add-on configuration | M | ADR-049 | `saveAddOnsAction`, `AddOnsEditor` | TC-UNIT-090, TC-INT-070, TC-INT-090, TC-E2E-070 | 5B | Verified | phase-5b.md |
| FR-039 Item relations | S | ADR-049 | `saveRelationsAction`, `RelationsEditor` | TC-INT-090, TC-E2E-070 | 5B | Verified | phase-5b.md |
| FR-040 Offers admin | M | ADR-020, ADR-050 | `admin/(shell)/offers/**`, `features/admin/content/offer-forms.tsx`, `content-actions.ts`, `services/admin-content.ts` | TC-UNIT-092, TC-UNIT-093, TC-INT-091, TC-E2E-071 | 5C | Verified (create/edit/expire/reactivate/delete; draft/scheduled/active/expired; public within 15 s) | phase-5c.md |
| FR-041 Banners | M | ADR-050 | `admin/(shell)/banners/**`, `content/banner-form.tsx` | TC-UNIT-040, TC-UNIT-092, TC-SEC-050, TC-INT-091, TC-E2E-072 | 5C | Partly verified: edit, safe links, window, delete verified; creating with a real upload NOT RUN (needs Storage) | phase-5c.md |
| FR-042 Café info & hours | M | ADR-050 | `admin/(shell)/cafe/page.tsx`, `content/cafe-forms.tsx` | TC-UNIT-041, TC-UNIT-092, TC-INT-091, TC-E2E-072 | 5C | Verified | phase-5c.md |
| FR-043 Gallery management | M | ADR-015, ADR-050 | `admin/(shell)/gallery/page.tsx`, `content/gallery-manager.tsx` | TC-SEC-060…064, TC-INT-091, TC-E2E-072 | 5C | Partly verified: publish/order/alt/caption/remove verified; real upload NOT RUN (needs Storage) | phase-5c.md |
| FR-044 Feedback moderation | M | TRD §6 | `admin/feedback/*` | TC-SEC-001/002, TC-E2E-073 | 6 | Planned | — |
| FR-045 Audit log | M | TRD §4 | `server/audit.ts`, dashboard "Recent activity" | TC-INT-061, TC-INT-071, TC-E2E-070 | 5A–6 | Partly verified (sign-in, menu, offers, banners, café, gallery audited; feedback in 6) | phase-5a.md, phase-5b.md |
| FR-046 Preview | S | UI_SPEC §13 | "Preview on the public site" link in the item editor | TC-E2E-070 | 5B | Verified (link shown only when the item is publicly visible) | phase-5b.md |
| FR-047 Revalidation | M | ADR-013, ADR-049 | `expireMenu()` in `menu-actions.ts` | TC-E2E-050/051/071/072 | 5B–5C | Verified (menu, offers, banners, café, gallery; ~0.1–0.2 s measured, warm cache; ADR-050) | phase-5b.md, phase-5c.md |
| FR-048 Veg marking | S | UI_SPEC §7.5 | `VegMark`, `dietType`, `isPureVegConfirmed` | TC-COMP-004 | 3, 4A | Verified (per-item mark; "100% VEG" only when the café flag is set) | phase-3.md, phase-4a.md |
| FR-049 Admin QR | M | ADR-018 | `admin/qr` | TC-E2E-043 | 6 | Planned | — |
| FR-050 Admin usability | M | UI_SPEC §8.4, §13 | `layout/AdminShell` etc. | TC-A11Y-002, TC-RESP-004 | 5A–6 | Planned | — |
| NFR-001 Responsive | M | UI_SPEC §17 | all pages | TC-RESP-001…004 | 4A–7 | In progress (core pages verified at 375/430/768/1024/1440) | phase-4a.md |
| NFR-002 Accessibility | M | UI_SPEC §2.3, §11 | all | TC-A11Y-001…006 | 4A–7 | In progress (core pages: axe 0 serious/critical at 390 and 1440, keyboard dialog checks) | phase-4a.md |
| NFR-003 Performance | S | TRD §13 | — | TC-PERF-001/002 | 7 | Planned | — |
| NFR-004 Security | M | SECURITY.md | — | TC-SEC-* | 3–7 | In progress (Phase 3: RLS deny-all, injection, safe errors, bundle scan verified; full review in 7) | phase-3.md |
| NFR-005 Privacy | M | SECURITY §10 | feedback, rate-limit pruning | TC-SEC-130, TC-INT-060 | 3, 6 | In progress (Phase 3 schema: no contact fields, HMAC-only rate-limit keys; retention in 6) | phase-3.md |
| NFR-006 Maintainability | M | TRD §3 | `eslint.config.mjs`, `tsconfig.json` (strict), Prettier, CI workflow | lint, typecheck, format:check | 2+ | In progress (tooling verified) | phase-2.md |
| NFR-007 Reliability | M | TRD §7 | `src/app/api/health/route.ts`, error boundaries | E2E health tests; TC-INT-080 (DB up/down) | 2–3 | Verified (app + DB health) | phase-2.md, phase-3.md |
| NFR-008 Freshness | M | ADR-013 | — | TC-E2E-050 | 5B | In progress (30 s tagged cache implemented, ADR-040; timing test in 5B) | phase-4a.md |
| NFR-009 Browser support | M | TEST_PLAN §1 | `playwright.config.ts` (Chromium + WebKit) | All E2E on both engines | 2+ | In progress (all E2E on Chromium + WebKit through Phase 4A) | phase-2.md … phase-4a.md |
| NFR-010 Content honesty | M | CLAUDE.md 6.2 | seed + UI | TC-E2E-090, TC-E2E-001/031/041, review | 3–7 | In progress (4B: unconfirmed details labelled "To be confirmed"; no coupons, ratings or ID checks; illustrative photos credited) | phase-3.md, phase-4b.md |
| NFR-011 Deployability | M | DEPLOYMENT.md | — | Phase 8 checklist | 8 | Planned | — |
| NFR-012 Data integrity | M | TRD §4 | Prisma schema + SQL CHECKs | TC-INT-001…003, 070 | 3 | In progress (DB CHECK/UNIQUE/FK verified, TC-INT-001…004; admin transactions TC-INT-070 in 5B) | phase-3.md |

**Phase 1 documentation deliverables** (CLAUDE.md §12): PRD, TRD, UI_SPEC, SECURITY, TEST_PLAN, TRACEABILITY, DEPLOYMENT, DECISIONS, OPEN_QUESTIONS, `design/reference/*` — Implemented in Phase 1; verified by team review.

**Phase 2 foundation items** (CLAUDE.md §12 Phase 2): design tokens (`src/app/globals.css`), fonts (`layout.tsx`), UI primitives (`src/components/ui/*`), env validation (`src/lib/config/env.ts` + `src/instrumentation.ts`), security headers (`src/lib/security/headers.ts`), health endpoint, style guide (`/dev/styleguide`). Verified by 39 Vitest tests and 56 Playwright tests (28 per engine); see `docs/PHASE_REPORTS/phase-2.md`.
