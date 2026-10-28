# DECISIONS — Architecture Decision Log

Format: ID · decision · alternatives · rationale · consequences. Status: **Accepted** (in force), **Proposed** (awaiting team confirmation), **Deferred** (decided in a later phase).

---

## ADR-001 Package manager: npm — Accepted
- **Alternatives:** pnpm, yarn (neither installed).
- **Rationale:** CLAUDE.md rule 25; npm 11.19.1 is installed; no existing lockfile.
- **Consequences:** `package-lock.json` is committed; CI uses `npm ci`.

## ADR-002 Runtime and library versions — Accepted (pinned in Phase 2, 2026-10-13)
**Installed and verified in Phase 2** (`npm ci` from a clean state, then lint, typecheck, unit tests, build and E2E all pass). Direct dependencies are pinned exactly in `package.json`.

| Package | Pinned | Note |
|---|---|---|
| next / eslint-config-next | 16.4.3 (was 16.4.0; security upgrade, ADR-057) | Template default `cacheComponents: true`, `partialPrefetching: true`, Turbopack + `@tailwindcss/turbopack` (no PostCSS) |
| react / react-dom | 19.3.0 | |
| typescript | **5.9.3** | Official Next 16.4 template uses `^5`; TypeScript 7 **not** used |
| eslint | **9.39.5** | Template uses `^9`; ESLint 10 not used |
| tailwindcss / @tailwindcss/turbopack | 4.3.3 | |
| zod | 4.6.7 | |
| lucide-react | 1.56.0 | |
| server-only | 0.0.1 | |
| vitest / @vitejs/plugin-react / jsdom | 5.0.4 / 6.1.2 / 29.1.1 | |
| @testing-library/react / jest-dom / user-event | 16.3.3 / 7.0.1 / 14.6.8 | |
| @playwright/test / @axe-core/playwright | 1.64.0 / 4.13.0 | Browsers: Chromium headless shell 156, WebKit 27.2 |
| prettier / prettier-plugin-tailwindcss | 3.9.10 / 0.8.1 | |
| @types/node | 22.20.5 | Matches Node 22 LTS |

Prisma (7.10.0), `@supabase/ssr`, `qrcode` and `sharp` are added in the phases that use them.

Planning table from Phase 1, kept for reference:

| Component | Planned | Notes |
|---|---|---|
| Node.js | 22.x LTS (dev machine: 22.13.1) | Next 16 needs ≥20.9; Prisma 7 needs ^20.19 / ^22.12 / ≥24; Vitest 5 needs ^22.12. Recommend the team keeps Node ≥22.13 (Node 24 LTS also fine). |
| Next.js | 16.4.x (App Router) | Next 16 renames `middleware.ts` to `proxy.ts`; check the docs in Phase 2. |
| React | 19.x | Peer of Next 16. |
| TypeScript | 5.9.x or 6.x unless 7.x is confirmed compatible | npm `latest` is 7.0.2 (native compiler). Use it only if `next build` and ESLint type-aware rules work with it. |
| Tailwind CSS | 4.3.x | CSS-first config (`@theme` in CSS), no `tailwind.config.js` needed. |
| Prisma (CLI + client) | **7.10.0 (stable)** | npm `latest` tag points at **8.0.0-rc.22**, a release candidate that also needs Node ≥22.18. Do not use RCs. Prisma 7 uses `prisma.config.ts` for connection URLs and a driver adapter (`@prisma/adapter-pg`). |
| @supabase/ssr | 0.12.x | Cookie-based server client; use `getClaims()`/`getUser()` for validation. |
| @supabase/supabase-js | 2.x | |
| Zod | 4.x | |
| Vitest | 5.x | |
| Playwright (@playwright/test) | 1.64.x | Chromium + WebKit projects. |
| @axe-core/playwright | 4.x | Accessibility checks. |
| lucide-react | latest 1.x | Icons (CLAUDE.md Section 5). |
| qrcode | 1.5.x | Server-side QR SVG/PNG generation. |
| ESLint | 9.x or 10.x, whichever `eslint-config-next` 16 supports | |

## ADR-003 Colour tokens: YAML/Tailwind values, not DESIGN.md prose — Accepted (CLAUDE.md 6.1, confirmed)
- **Decision:** primary `#a93200`, primary-container `#d1430a`, secondary-container `#fcb812`, tertiary `#006947`, veg green `#15803D`, plus the full YAML palette (see `UI_SPEC.md` §2). `#F15A24` is used only for decorative glows and shadows (for example the `rgba(241,90,36,…)` shadows in `code.html`).
- **Rationale:** the YAML block, all 5 `code.html` Tailwind configs and the rendered pixels use `#a93200`. White on `#a93200` = 6.68:1 (AA); white on `#F15A24` = 3.37:1 (fails AA for normal text).

## ADR-004 Primary button hover colour: `#d1430a` instead of `#E64A19` — Proposed
- **Problem:** `code.html` uses `hover:bg-culinary-orange-deep` (`#E64A19`) under white `label-lg` (14 px bold) text. Measured contrast is **3.92:1**, which fails WCAG AA for normal text (14 px bold is not "large text").
- **Decision:** primary buttons hover to `primary-container` `#d1430a` (white text 4.65:1, AA). `#E64A19` stays available for non-text accents (icons on light backgrounds, borders, decorative gradients).
- **Alternatives:** keep `#E64A19` (fails AA); darken on hover (inverts the design's "brighter on hover" feel).
- **Consequence:** visually very close to the design (both are warmer/brighter than `#a93200`). Documented in `UI_SPEC.md` §2.3.

## ADR-005 Radii: use the radii actually used in `code.html` — Accepted
- **Conflict:** YAML `rounded` (DEFAULT 0.5rem, lg 1rem, xl 1.5rem) vs the `code.html` Tailwind config (DEFAULT 0.25rem, lg 0.5rem, xl 0.75rem).
- **Decision:** follow `code.html` per component. Its config equals Tailwind v4's defaults for `rounded`, `rounded-lg`, `rounded-xl` (0.25/0.5/0.75 rem), and it uses Tailwind defaults for `rounded-md` (0.375rem), `rounded-2xl` (1rem) and `rounded-3xl` (1.5rem). So we keep **Tailwind v4 default radii** and do not override them.
- **Check:** this also matches DESIGN.md prose: inputs 12 px (`rounded-xl`), cards 16–24 px (`rounded-2xl`/`rounded-3xl`), pills `rounded-full`. Usage counts across the 5 screens: full 261, xl 91, 2xl 75, lg 18, 3xl 12, md 10.

## ADR-006 Icons: Lucide instead of Material Symbols — Accepted
- **Rationale:** CLAUDE.md Section 5 prescribes Lucide; Stitch loads Material Symbols from Google Fonts (would be a remote dependency). A mapping table is in `UI_SPEC.md` §9.
- **Consequence:** Lucide no longer ships brand logos (Instagram/Facebook). Social links use generic icons plus text labels, which is also more accessible.

## ADR-007 Fonts: Sora + Plus Jakarta Sans via `next/font/google` (self-hosted at build) — Accepted
Weights used in `code.html`: Sora 600/700/800; Plus Jakarta Sans 400/500/700/800. `next/font` downloads them at build time and serves them from our own origin (no runtime request to Google).

## ADR-008 Money as integer paise — Accepted
All prices are stored as `Int` paise (₹1 = 100 paise) and formatted as `₹149` (no space, per DESIGN.md). Avoids floating point; Postgres `integer` covers up to ₹21 million per value.

## ADR-009 Authorization lives in server code; Supabase RLS is deny-all — Accepted (CLAUDE.md Section 5)
Prisma connects as a privileged role and bypasses RLS. A hand-written SQL migration enables RLS on every table in `public` (including `_prisma_migrations`) with **no** policies, and additionally `REVOKE ALL` on those tables from `anon` and `authenticated`. As a result, the auto-generated Supabase REST/GraphQL API returns nothing or a permission error. Tested in Phase 3 (TC-SEC-020).

## ADR-010 Admin identity: Supabase Auth email + password + `AdminUser` allowlist — Accepted
- Differs from the synopsis pseudocode (`VerifyCredentials(Database, Username, Password)`), which implies storing credentials in the app database. Supabase handles password hashing; the app stores only the Supabase user ID in `AdminUser`.
- Public signup is disabled in the Supabase dashboard. The first admin is created in the dashboard and allowlisted by a server-side script (`DEPLOYMENT.md` §6).
- Every admin Server Action and Route Handler calls `requireAdmin()`, which validates the JWT (`getClaims()`, falling back to `getUser()`) and checks `AdminUser.isActive`. The proxy only refreshes the session and redirects; it is never the only check.

## ADR-011 Admin mutations via Server Actions; uploads and public writes via Route Handlers with Origin checks — Accepted
- Server Actions get Next.js's built-in Origin/Host comparison (CSRF protection) and are POST-only. Each action still calls `requireAdmin()` and validates its input with Zod.
- Route Handlers that change state (`POST /api/v1/feedback`, `POST /api/admin/uploads`, `POST /api/admin/logout`) explicitly check that `Origin` matches `NEXT_PUBLIC_SITE_URL` (or the dev origin) and reject otherwise (403).
- Session cookies: `HttpOnly`, `Secure` in production, `SameSite=Lax` (set by `@supabase/ssr`; verified in Phase 5A).

## ADR-012 Public read path — Accepted
- Public pages are Server Components that call server-only data-access functions in `src/server/` directly (no HTTP hop).
- The same functions back the public JSON API (`/api/v1/...`). The API is required by CLAUDE.md Section 8 and Phase 3 and is useful for tests.
- The menu search/filter runs as one Prisma query with `where` conditions combined by AND, plus `skip/take` pagination. This differs from the synopsis pseudocode, which filters in memory (synopsis difference D-08).

## ADR-013 Freshness ≤ 30 s — Accepted (mechanism implemented in Phase 4A, ADR-040; end-to-end timing test TC-E2E-050 in 5B)

**Phase 2 note:** Cache Components is enabled (Next 16.4 default). Data is dynamic by default, and caching is opted into with `'use cache'` + `cacheLife` + `cacheTag`. Request data (`searchParams`, `cookies()`) must be read inside `<Suspense>` so that the static shell can still be prerendered. Phase 4A will use `'use cache'` with `cacheTag` per entity and a `cacheLife` revalidate of ≤30 s; admin actions will call `revalidateTag`/`updateTag` (docs: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/`).
- Every successful admin mutation calls on-demand revalidation for the affected tags/paths (for example `menu`, `item:<slug>`, `home`, `offers`).
- Public pages also carry a time-based revalidate window of ≤ 30 s as a safety net.
- Next 16's caching APIs (`revalidateTag`/`updateTag`, `cacheLife`, Cache Components) are checked against the installed version's docs before implementation; the exact calls are recorded here then.
- Tested by TC-E2E-050: toggle availability, then poll the public page until the change shows, asserting ≤ 30 s.

## ADR-014 Rate limiting: Postgres counter table via Prisma — Accepted (CLAUDE.md Section 5 default)
- Table `RateLimitBucket(key, windowStart, count)` with an atomic upsert-increment in a fixed window. The key is an HMAC-SHA-256 of `IP + scope (+ email for login)` using the secret `RATE_LIMIT_SALT`, so raw IPs are never stored. Old buckets are pruned opportunistically.
- **Limits (initial):** login 5 per 15 min per IP+email and 20 per 15 min per IP; feedback 3 per 10 min per IP; uploads 30 per 10 min per admin.
- **Alternative:** Upstash Redis, only if the team supplies credentials. In-memory counters are never used as the production control.

## ADR-015 Image uploads: validate by magic bytes, then re-encode with `sharp` — Proposed (verified in Phase 5B)
- Accept JPEG/PNG/WebP only, at most 5 MB and at most 4000×4000 px.
- Check magic bytes first, then decode and re-encode to WebP with `sharp`. Re-encoding strips EXIF/GPS metadata and rejects disguised files that fail to decode.
- Filenames are generated as `<entity>/<uuid>.webp`. Files are stored in the Supabase Storage public bucket `public-media` through the server only, using the server-only secret key after `requireAdmin()`.
- `sharp` is already a Next.js image-optimisation dependency, so it adds little weight. This is confirmed at install time.

## ADR-016 Content Security Policy — Deferred to Phase 7 (baseline headers in Phase 2)
- **Phase 2 baseline headers:** HSTS (production only), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geolocation off), and a CSP with `frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`, plus `img-src` and `connect-src` limited to self and the Supabase project host, and `frame-src https://www.google.com` for the map.
- **Script policy trade-off:** a nonce-based `script-src` forces every page to render dynamically, which conflicts with cached public pages (ADR-013). Phase 7 evaluates Next's SRI/hash support. Any `'unsafe-inline'` that remains is recorded as a residual risk in `SECURITY.md`.

## ADR-017 Map: keyless Google Maps embed plus a directions link — Proposed
- Use an `<iframe>` (`https://www.google.com/maps?q=<lat>,<lng>&output=embed`, lazy-loaded, with a `title`) and a "Get directions" link (`https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`).
- No API key is needed. The embed is shown only when coordinates are configured; otherwise only the address text is shown.
- **Privacy note:** loading the iframe contacts Google. This is disclosed on the contact page.

## ADR-018 QR code — Accepted
- `/qr` (public page) and `/admin/qr` show a QR code encoding `${NEXT_PUBLIC_SITE_URL}/menu?src=qr`. It is generated server-side with `qrcode` as SVG, with a PNG download.
- At startup the app refuses `localhost` or a non-https `NEXT_PUBLIC_SITE_URL` when `NODE_ENV=production`. The `src=qr` parameter is informational only; it is not stored or tracked.

## ADR-019 No ordering UI; display-only add-ons — Accepted (CLAUDE.md 3.0, 6.3)
- The Stitch customiser (radio buttons, checkboxes, quantity stepper, totals) becomes a read-only "Customisations available" list: group name, rule ("choose 1", "optional"), option names and price deltas.
- No form inputs that do nothing are rendered.

## ADR-020 Offer model: one `Offer` table with a `kind` — Proposed
- **`kind`:**
  - `DISCOUNT`: one menu item at a promotional price; the card shows a struck-through regular price.
  - `COMBO`: a bundle of items with quantities and a bundle price; "SAVE ₹X" and "% OFF" are **computed** from current item prices.
  - `INFO`: a text-only deal, such as a time-window special, with no computed price.
- **Flags:** `isStudentOffer` puts it in the Student Zone; `isFeatured` puts it on the homepage.
- **Public status** is computed in IST (`Asia/Kolkata`) from `isPublished`, `startsAt` and `endsAt`, plus a manual `expiredAt` (the admin's "Expire now"):
  - `SCHEDULED` if now < `startsAt`;
  - `EXPIRED` if `expiredAt` is set, or `endsAt` ≤ now;
  - otherwise `ACTIVE`.
- Public pages list ACTIVE offers, plus SCHEDULED ones in a separate "Coming soon" block. They never list EXPIRED ones.
- Coupon codes are not modelled. No redemption system exists (CLAUDE.md 6.2).

## ADR-021 "Popular" = best-seller OR trending flag — Accepted
Matches the synopsis `Item.IsPopular` and CLAUDE.md 3.1 E. Both flags are set by the admin; no sales statistics are computed or shown.

## ADR-022 Price-range bands — Accepted
URL params `minPrice`/`maxPrice` are whole rupees, converted to paise on the server. The UI bands are fixed and their boundaries are tested (TC-UNIT-012):
- "Under ₹100" = price < ₹100;
- "₹100–₹200" = ₹100 ≤ price ≤ ₹200;
- "₹200+" = price > ₹200.

## ADR-023 Homepage trending count: 4 — Proposed (changes assumption A-07)
The synopsis pseudocode says `FetchTrendingItems(limit=5)`, but the approved design has a 4-column grid (`lg:grid-cols-4`), so a 5th card would sit alone on a second row. The homepage therefore shows up to **4** trending/best-seller items, with a "See full menu" link. The value is a single constant and easy to change.

## ADR-024 Header layout fixes to the Stitch design — Proposed
Rendering `code.html` at 1440 px showed two defects:
- Nav labels wrap onto two lines ("Digital / Menu", "Table QR / Order").
- The desktop info bar sits inside a `fixed` header while `main` only reserves `pt-20`, so the info bar overlaps content.

**Fix:**
- The header becomes `sticky`, which removes the overlap.
- Nav labels get `whitespace-nowrap`.
- The full inline nav appears at ≥1280 px (Stitch `xl`). From 768 to 1279 px a menu button opens a drawer (Stitch provides no navigation at those widths). Below 768 px there is a compact header and a bottom navigation bar, based on the mobile Stitch screen.

## ADR-025 Demo data — Accepted
Content tables carry `isDemo Boolean @default(false)`. The seed sets `isDemo=true` and refuses to run when `NODE_ENV=production` or when `ALLOW_DEMO_SEED` is not `true`. Public pages show a small "Demo data" ribbon while any demo content is visible. Placeholder images are generated locally (neutral coloured tiles with the item name), never hotlinked.

## ADR-026 Feedback without star ratings — Proposed
Feedback is a message (10–1000 characters) plus an optional display name (≤ 40 characters). No email or phone is collected, and there are no star ratings: aggregate ratings would be shown as if verified. Only `APPROVED` feedback is public. Rate-limit keys use a hashed IP; nothing else identifying is stored. Open question Q-11 asks whether the café wants ratings.

## ADR-027 Reference rendering tool kept outside the repo — Accepted
The Phase 1 reference images in `design/reference/` were rendered with `playwright-core` 1.64.0 installed in a temporary folder (`/tmp/zorko-tools`). It drove the local Google Chrome with a throwaway profile, so no browser download or project dependency was needed. The project's own Playwright setup arrives in Phase 2.

## ADR-028 HSTS and `upgrade-insecure-requests` only for https sites — Accepted (Phase 2 finding)
- **Problem found by the WebKit E2E run:** the first header set sent HSTS and the CSP `upgrade-insecure-requests` directive for every production build. Safari/WebKit applies the upgrade even to `http://localhost`, so every CSS and JS request became `https://localhost` and failed with a TLS error (unstyled, non-interactive page). Chrome exempts localhost, which hid the bug there.
- **Decision:** send both only when `NEXT_PUBLIC_SITE_URL` is https (`isHttps` in `src/lib/security/headers.ts`). Production on Vercel is required to be https (ADR-018 / env validation), so production still gets both.
- **Tests:** unit tests for http and https; E2E asserts that they are absent on the http test server.

## ADR-029 Production strictness keyed to `VERCEL_ENV`, not `NODE_ENV` — Accepted (refines ADR-018)
`next build && next start` sets `NODE_ENV=production` on laptops and in CI too, where `http://localhost` is legitimate. The rules "https required" and "no localhost" for `NEXT_PUBLIC_SITE_URL` therefore apply when `VERCEL_ENV=production`. The variable is validated at server start through `src/instrumentation.ts`. Phase 8 will add a `npm run check:prod-config` script (TC-SEC-120) for non-Vercel production hosts.

## ADR-030 Lockfile regenerated through a clean npm cache — Accepted (Phase 2 finding)
- **Problem:** `npm ci` from a clean state failed with "Missing: @unrs/resolver-binding-linux-arm64-musl from lock file". The cause was 4 cache entries in the developer's `~/.npm/_cacache` owned by another user (likely an old `sudo npm`). npm could not read them and silently left that optional Linux binding out of `package-lock.json`. This would break CI on Linux.
- **Decision:** regenerate the lockfile with `--cache /tmp/zorko-tools/.npm-cache` (a clean cache). The direct dependency versions are unchanged (verified by diff), and `npm ci` now succeeds.
- **Recommendation to the team:** fix the local cache ownership once with `sudo chown -R $(whoami) ~/.npm`. This is not run automatically: it changes a system folder and needs your password.

## ADR-031 Dialog focus management — Accepted
Native `<dialog>` + `showModal()` provides inertness and Escape handling. Two additions:
- **Tab wrapping:** Tab and Shift+Tab are wrapped inside the dialog, because native modals let Tab escape to the browser UI.
- **Explicit focus restore:** the dialog stores the opener and returns focus to it on close. Safari does not focus buttons on mouse click, so this is only meaningful when the opener had focus (keyboard use), which is the case that matters.

Verified on Chromium and WebKit (TC-COMP-006, now an E2E test because jsdom lacks `showModal`).

## ADR-032 Accepted dev-only advisory: `braces` ≤3.0.3 (GHSA-vfj7-8cjw-p6xm) — Accepted, review in Phase 7
- **Chain:** `eslint-config-next@16.4.0 → @next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3`. Severity high: stack exhaustion on deeply nested brace patterns. Published 2026-09-18; **no patched version exists**.
- **Exposure:** lint tooling only. It processes our own config globs on developer and CI machines and is never shipped or reachable by user input.
- npm's suggested "fix" downgrades `eslint-config-next` to 14.x, which is incompatible with Next 16 and is rejected.
- **Controls:** `npm audit --omit=dev` = 0 vulnerabilities; CI gates on production dependencies at high or above. Re-check at each phase and adopt the patched release once published.

## ADR-033 Prisma 7 configuration — Accepted (Phase 3)
- **Versions:** `prisma` / `@prisma/client` / `@prisma/adapter-pg` 7.10.0, `pg` 8.23.1. Checked against the installed packages: Prisma 7 removed `url`/`directUrl` from `schema.prisma`.
- **Migrations / CLI:** `prisma.config.ts` sets `datasource.url = DIRECT_URL` and loads `.env.local` through `@next/env` (Prisma 7 no longer reads env files).
- **Runtime:** `src/server/db.ts` builds `PrismaClient` with the `PrismaPg` adapter on the pooled `DATABASE_URL` (Supabase transaction pooler; `pg` uses unnamed prepared statements, which the pooler supports). Pool `max: 5`, 5 s connect timeout, 10 s `statement_timeout`.
- **Generator:** `prisma-client` with output `src/generated/prisma` (git-ignored, rebuilt by `postinstall`, `typecheck` and `build`).
- **`prisma` CLI is a devDependency.** The runtime needs only `@prisma/client` and the adapter.
- npm 11 blocked the install scripts of `prisma`/`@prisma/engines`. They were **not** approved: the CLI downloads the schema engine on first use, which works.

## ADR-034 Throwaway Docker Postgres for automated DB tests — Accepted (Phase 3)
- Integration and E2E tests use a local `postgres:17-alpine` container (`scripts/test-db.sh`, port 54329, bound to 127.0.0.1, non-secret local password) with Supabase's `anon`/`authenticated` roles recreated. Tests never touch the team's Supabase projects, and they run before the team supplies credentials.
- **"Reset" recreates the container** and runs `prisma migrate deploy` + seed, instead of `prisma migrate reset`. The test database is disposable, and Prisma refuses `migrate reset` from AI agents.
- **Trade-off:** Postgres 17 locally vs Supabase's version; the live Supabase REST check (TC-SEC-020) covers the real project.

## ADR-035 Public read API is uncached in Phase 3 — Accepted
- Every `/api/v1/*` handler calls `connection()` (required: with Cache Components, a GET handler without runtime data would be prerendered at build time and would query the DB during `next build`). Responses carry `Cache-Control: no-store`, so availability changes are visible on the next request.
- Page-level caching with tags (`use cache` + `revalidateTag`, ≤30 s freshness) is decided with the pages in Phase 4A and Phase 5B.
- Health returns 503 `{status:"degraded", db:"down"}` when the DB is unreachable.

## ADR-036 Prisma CLI advisories fixed with npm overrides — Accepted (Phase 3)
- The `prisma@7.10.0` CLI pulls `deepmerge-ts@7.1.5` (GHSA-ggr8-5vv4-36mx, stack exhaustion) and, through its bundled local dev server, `mysql2@3.15.3` (GHSA-3f6p-5ww8-9rcr and GHSA-rgwj-5xj2-c3m3). npm's "fix" was a downgrade to Prisma 6, which is rejected (ADR-002).
- **Decision:** `overrides` pin `deepmerge-ts@8.0.2` and `mysql2@3.24.6`. Verified: `prisma generate`, `validate`, `migrate deploy`/`status`, seed and all tests pass.
- Remove the overrides once Prisma ships patched dependencies (re-check in Phase 7).

## ADR-037 Search escapes LIKE wildcards — Accepted (Phase 3 finding)
Prisma parameterises `contains`, but it does **not** escape `%`, `_` and `\`. A search for `%` matched every item. `escapeLike()` escapes them before the query (TC-UNIT-013, TC-SEC-090). This was not an injection (values were always parameters), but results were wrong.

## ADR-038 Demo seed is create-only and guarded — Accepted (Phase 3)
- It runs only with `ALLOW_DEMO_SEED=true`, never when `NODE_ENV` or `VERCEL_ENV` is `production`.
- It creates missing rows only (by slug/key) and never updates or deletes. It never creates an admin or a password. Every row has `isDemo = true`.
- Placeholder images are generated locally (`public/demo/*.webp`, labelled "DEMO IMAGE"). Demo storage paths `demo/…` are served from `/public`; real uploads (Phase 5B) use Supabase Storage paths, and `mediaUrl()` only accepts these two path shapes.
- `npm run db:remove-demo -- --confirm` deletes only demo rows, in one transaction.
- The menu has 17 items in total; one is unpublished on purpose, to test hiding.

## ADR-039 Schema details settled in Phase 3 — Accepted
- **`CategoryIcon` enum:** BURGER, PIZZA, PASTA, SNACKS, SANDWICH, BEVERAGE, COFFEE, DESSERT, MEAL, GENERAL. Mapped to Lucide icons in Phase 4A.
- **Café verification flags:** `addressVerified`, `contactVerified`, `hoursVerified`, `mapVerified`, `socialVerified` (all false for demo data). The API exposes them as `verified{…}` so the UI can label placeholders.
- **At most 4 images per item:** enforced in the database by `sortOrder BETWEEN 0 AND 3` + `UNIQUE(menuItemId, sortOrder)`.
- `RateLimitBucket` is unique on `(key, scope, windowStart)`; the TRD said `(key, windowStart)`, but the scope is needed so login and feedback limits do not collide.
- **Constraint lesson (Phase 3 finding):** a CHECK that evaluates to NULL passes. `Offer_price_matches_kind` now uses `IS NOT NULL` explicitly. The migration was corrected before it was applied anywhere except the throwaway test DB.
- **Menu list:** count and page run as two parallel reads, not a `$transaction`. That avoids pinning a pooled connection and a `pg` deprecation warning from the adapter.

## ADR-040 Public page data: request-time rendering + `'use cache'` loaders (30 s, tagged) — Accepted (Phase 4A)
- **Loaders:** pages read data only through `src/server/public-data.ts`. Each loader is `'use cache'` with `cacheLife({ stale: 30, revalidate: 30, expire: 300 })` and tags `menu`, `offers`, `cafe`, `home` and `item:<slug>`.
- **No database access during `next build`:** every data-reading component first touches request data (`connection()` or `searchParams`/`params`) inside a `<Suspense>` boundary. The build therefore works without credentials, and pages stream as a static shell plus data.
- **Freshness:** cached entries are at most 30 s old, plus one background refresh on the next request. Phase 5B admin actions will call `updateTag`/`revalidateTag` for the affected tags, so changes appear on the next request; TC-E2E-050 will measure this. A direct edit in the Supabase table editor bypasses the app and relies on the 30 s window.
- **Alternatives rejected:**
  - Fully dynamic pages with no cache: every view hits the database.
  - Prerendering at build: needs the database at build time and serves stale data.
- **Robustness:** the header and footer catch database errors and render without café data, so navigation still works. Page errors use the `(public)/error.tsx` boundary inside the layout.

## ADR-041 Missing item pages: not-found UI + `noindex`, HTTP 200 under partial prerendering — Accepted (Phase 4A finding)
- With Cache Components, `/menu/[slug]` sends the layout's static shell first. When `notFound()` runs in the streamed part, Next 16 renders the not-found UI and injects `<meta name="robots" content="noindex">`, but the status is already 200 (documented in `not-found.md`).
- **Tried:** `export const instant = false` plus loading the item outside Suspense. The shell still streamed first, so the status stayed 200.
- **Rejected:**
  - A database lookup in `proxy` for every item request: extra cost and complexity.
  - `generateStaticParams` with `dynamicParams = false`: needs the database at build time, and newly added items would 404 until a redeploy.
- **Decision:** keep streaming. Search engines are told `noindex`, and visitors see a friendly "This dish isn't on the menu" page with a link back (TC-E2E-020). The JSON API still returns real 404s.

## ADR-042 Links to pages from later phases are hidden until those pages exist — Accepted (Phase 4A)
- `src/lib/site/nav.ts` defines the full navigation once, with a `live` flag. Header, drawer, bottom nav, footer, hero CTAs and "View offer"/"Explore Student Zone" buttons render only for live pages, so no phase ships a dead link (CLAUDE.md rule 7). An E2E test fetches every internal link on the core pages and expects 200.
- Phase 4B switches on `/offers`, `/student-zone`, `/gallery` and `/contact`; Phase 6 switches on `/feedback` and `/qr`. Until then:
  - the bottom nav shows Home · Menu only;
  - the hero's first feature tile reads "Digital Menu / Search & filter" instead of "QR Digital Menu";
  - the reviews and gallery sections appear only once approved feedback or published images exist.

## ADR-043 Demo menu modelled on zorko.in; frozen test fixtures — Accepted (Phase 4B, team request)
- **Team request (2026-10-14):** use the official brand site https://zorko.in/ as the reference for menu items.
- **What was used:** the development demo menu (`prisma/demo-data.ts`) uses the brand site's category and item names: 8 categories, 24 items (Veg Classic Burger, Kulhad Pizza, Spicy Paneer Wrap, Vegetable Momos, Double Masala Maggie, Crispy Loaded Fries, Premium Cold Coffee, Chocolate Browny Shake, …).
- **What was not used:**
  - The site lists no prices, so every price is an invented placeholder.
  - Descriptions are our own neutral wording, prefixed "Demo item".
  - No brand images or text were copied.
- All rows stay `isDemo = true`; the site is a brand reference, not the Sangli outlet's confirmed menu (Q-03).
- **Pure veg:** the brand site describes ZORKO as "100% Veg". This supports Q-06 but is not outlet confirmation, so `isPureVegConfirmed` stays false until the café confirms.
- **Test fixtures:** the original dataset moved to `prisma/fixtures/test-data.ts` and is frozen. `scripts/test-db.sh` seeds it with `SEED_DATASET=test`, so integration/E2E assertions and visual baselines don't change when the demo menu changes.

## ADR-044 Real Sangli menu imported from the printed outlet menu — Accepted (Phase 4B, team-supplied data)
- **Source:** two photos of the printed menu of Cafe Zorko, Vishrambag, Sangli, supplied by the team on 2026-10-14 (taken 2026-10-12). Transcribed into `prisma/data/sangli-menu.ts`: 16 categories, 65 items, prices exactly as printed. `isDemo = false`.
- **Mapping:**
  - "Best Seller" → `isBestSeller`; "Must Try" → `isTrending` (shown as the Trending badge); "New Launch" → `isFeatured`.
  - Second prices become add-on options: Regular/Baked pasta (+₹30), Regular/Large fries (+₹30 / +₹40), "+25 with ice-cream scoop", add cheese +₹15/+₹30/+₹40, Maggi cheese +₹30 / butter +₹10, cheese/mojito injector +₹30, double cheese slice / grill any burger +₹30.
- **Left out:**
  - Desserts: prices cut off in the photo (Q-07).
  - The menu's food photos: marked "illustrative" and not ours to copy. Items use neutral "Photo coming soon" tiles from `public/placeholder/`.
  - Brand claims printed on the menu (outlet/city counts, TV appearances, "We manage kitty/birthday parties"), per CLAUDE.md §6.2/§6.3.
- **Outlet details from the menu (answers Q-01 address, Q-02 phone, Q-06):**
  - address "Cafe Zorko, Chavan Arkade, Near Sambha Bhel, 100 ft. Road, Vishrambag, Sangli 416415";
  - phone 9890011348;
  - pure veg: the menu carries the green veg mark, so `isPureVegConfirmed = true` and the "100% VEG" pill is shown. The team can object.
  - Opening hours, coordinates, email, WhatsApp and social links are not on the menu and stay unconfirmed.
- **Loading:** `npm run db:import-menu` (`prisma/import-menu.ts`):
  - create-only by slug;
  - refuses while demo items exist, so menus never mix;
  - replaces the café row only if it is still demo;
  - refuses in production (Phase 8 procedure).
- **Tests:** frozen fixtures (ADR-043). `tests/unit/sangli-menu.test.ts` checks the transcription: unique slugs, price ranges, spot prices.

## ADR-045 Illustrative menu photos from Wikimedia Commons — Accepted (Phase 4B, team request)
- **Request (2026-10-14):** replace the "photo coming soon" tiles with matching food images. The café has supplied no photos yet (Q-10), and the printed menu's own photos are not ours to copy.
- **Source and licence:**
  - Wikimedia Commons, chosen through its public API, which reports each file's licence.
  - Allowed licences: CC0, public domain, CC BY 4.0, CC BY-SA 4.0. 23 of the 24 photos are CC0/public domain; only the Maggi photo is CC BY-SA 4.0.
  - `scripts/fetch-stock-images.mjs` downloads the files, re-encodes them to 1200×900 WebP (metadata stripped) in `public/stock/`, and writes `src/lib/site/image-credits.json`.
- **Content checks:** every candidate was checked by eye before use:
  - **vegetarian only** (pure-veg outlet): rejected candidates showed sausage, chicken or meat lasagna;
  - appetising, and matching the dish.
  - Per-item photos are used where a close match exists (red-sauce pasta, strawberry mojito, Oreo/strawberry shake, chocolate cold coffee, masala tea, hot chocolate, salsa wrap); otherwise the category photo.
- **Honesty:**
  - alt text says "Illustrative photo of …";
  - the menu header says "Photos are illustrative";
  - item pages link to the new `/credits` page (title, author, licence and source for every photo; required for CC BY/BY-SA, a courtesy for CC0);
  - the footer links to the credits.
  - This mirrors the printed menu's own "images are for illustrative purposes" line.
- **Replacement:**
  - Admin photo uploads (Phase 5B) replace these per item.
  - `npm run db:import-menu` upgrades earlier "photo coming soon" tiles to these photos, but never touches admin-uploaded images.
- **Tests:**
  - `tests/unit/sangli-menu.test.ts`: every photo used exists, is credited and has an allowed licence;
  - an E2E check that the credits page renders.
  - Mobile visual baselines were re-recorded for the deliberate footer change; only the footer line differed.
- **Revision 2026-10-15 (team feedback: "many images don't match the names"):**
  - Every item was re-searched individually, and licences were widened to CC BY / CC BY-SA 2.0–4.0 (all credited on `/credits`). Each candidate was reviewed by eye. Now 44 photos cover 47 items with a dish-specific or very close match, e.g. Aloo Tikki Burger, Paneer Tikka Pizza, Fried Momos, White Sauce Pasta, Penne Arrabbiata, Mango Mojito, Peach Iced Tea.
  - The remaining 18 items share an accurate photo of the same dish type, because no licensed photo of the exact variant exists: Maggi variants, toasties, garlic breads, several mojito and iced-tea flavours.
  - **Rejected:** meat (beef "paneer" burgers, chicken burritos, pepperoni), alcohol (wine-bar drinks, a beer glass in shot), unappetising crops.
  - **Photos from zorko.in were NOT used:** they are the brand's copyrighted photos. That needs written permission (Q-09); with it, or with the café's own photos (Phase 5B uploads), these can be replaced.
  - `db:import-menu` now refreshes any of our bundled images (`placeholder/`, `stock/`) to the current per-item photo, never admin uploads (verified).


## ADR-046 Map and directions from the verified address — Accepted (2026-10-15)
- ADR-017 showed the map and the "Get directions" link only when coordinates are set. The café has confirmed its street address (ADR-044) but not coordinates.
- Now the map and directions use the coordinates when set; otherwise the **verified** address (`name, addressLine, city, postalCode`), URL-encoded. An unverified placeholder address is never sent to Google, so customers are never pointed to a wrong place.
- The logic lives in `getCafeInfo` (`mapQuery`, `directionsUrl`), shared by the home "Visit" section and `/contact`. Tested in `tests/integration/api.test.ts` (TC-INT-042).
- The embedded Google map can show Google's own place details (for example its ratings). Those come from Google, not from this site; the site itself still shows no ratings (CLAUDE.md §6.2).

## ADR-047 SEO metadata, sitemap and robots — Accepted (2026-10-15)
- Every page builds its metadata with `pageMetadata()` (`src/lib/site/seo.ts`): title, description, canonical URL, and complete Open Graph and Twitter fields. Next.js replaces rather than merges a parent's `openGraph`, so a shared helper avoids pages silently losing `siteName`, `locale` or the image.
- Share image: the page's own photo (dish or offer), else `/og-default.jpg`, a 1200×630 crop of the credited CC BY-SA 4.0 burger photo (same licence).
- `/sitemap.xml` is built at request time: the pages that are live in the navigation (ADR-042) plus visible dishes and offers that have not ended, using the same visibility rules as the pages (`src/server/services/sitemap.ts`). Unpublished, archived, expired and draft content never appears.
- `/robots.txt` allows the site and disallows `/api/` and `/dev/`. Not-found pages and `/credits` are `noindex`.
- No structured data (JSON-LD) yet: CLAUDE.md §3.1 I allows it only for verified data, and hours and coordinates are not confirmed (backlog).
- **Revision (2026-10-15):** bare coordinates make Google open a point, not the business ("Place couldn't load" in its card; directions to a pin). New optional field `CafeInformation.mapsQuery` (migration `20261015120000_cafe_maps_query`, additive): the place exactly as listed on Google Maps. Order is now `mapsQuery` → coordinates → verified address. For Sangli it is "Cafe Zorko, 100 Feet Rd, Sangli, Vishrambag, Sangli Miraj Kupwad, Maharashtra 416415, India" (from the team), so the map shows the Cafe Zorko listing and directions open it. Admins edit it in Phase 5C (café info, "Google Maps place").

## ADR-048 Admin authentication as built — Accepted (2026-10-15, Phase 5A)
- **Libraries:** `@supabase/ssr` 0.12.7 and `@supabase/supabase-js` 2.118.0 (latest at install; checked against the package README and Supabase's Next.js SSR guide). Next 16 `src/proxy.ts` (renamed from middleware).
- **Two checks, two strengths.** The proxy calls `getClaims()` (verifies the JWT, refreshes the cookie) and redirects visitors without a session; it is only a convenience. `requireAdmin()` calls `getUser()`, which asks the Supabase Auth server, so a forged, expired **or signed-out** token is rejected immediately (a JWT checked only locally stays valid until it expires, up to 1 h). The cost is one network call per admin request, acceptable for a handful of admins.
- **Allowlist only.** `checkAllowlist(userId)` takes just the verified user ID; token claims such as `app_metadata.role` are never read. Every admin page and Server Action calls `requireAdmin()`; the shell layout checks too, but layouts are not re-run on client navigation, so it is never the only check.
- **No secrets in the browser.** Login and logout are Server Actions; the browser never talks to Supabase Auth, so no Supabase client or key ships to the client (bundle scan: 0 matches). `SUPABASE_SECRET_KEY` is not used in 5A: provisioning takes the User UID from the dashboard (`npm run admin:add`).
- **Login hardening.** One generic error for unknown email, wrong password and non-admin accounts; non-admins are signed out at once and a `LOGIN_REFUSED` audit entry is written (no email or IP stored). Extra form fields are stripped (no mass assignment). `?next=` accepts internal `/admin` paths only (`safeAdminNext`).
- **Rate limiting (ADR-014 as built).** 5 attempts per IP+email and 20 per IP per 15 min, counted atomically in Postgres with HMAC keys. The client IP is the first `x-forwarded-for` hop, which is trustworthy on Vercel (its edge sets the header). On a self-hosted `next start` the header could be spoofed; that setup is only used locally and in tests. Supabase Auth applies its own sign-in limits as a second layer.
- **Cookies.** HttpOnly, `SameSite=Lax`, `Secure` when the site URL is https (verified in E2E). Admin responses: `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`; `/admin` is disallowed in robots.txt.
- **Supabase URL.** Only the origin of `NEXT_PUBLIC_SUPABASE_URL` is used. The dev value had been set to the REST URL (`…/rest/v1/`). That broke Auth, and it also exposed a **false pass in TC-SEC-020** (see the Phase 3 erratum): the REST-denial test appended `/rest/v1` again, got 404 "invalid path" (PGRST125) and counted it as denied. The test now uses the origin, requires the real denial codes (`42501` permission denied, or `PGRST205` hidden table) and has a positive control. Re-run on 2026-10-15: every table really is denied (401 / 42501).

## ADR-049 Menu administration as built — Accepted (2026-10-16, Phase 5B)
- **Server Actions, not REST endpoints.** Every admin write is a Server Action in `src/features/admin/menu-actions.ts`. Next.js makes them POST-only and checks the Origin header (CSRF, ADR-011). Each action (1) calls `requireAdmin()` first, (2) validates every argument with Zod, including IDs and booleans bound on the client, (3) writes through the typed service `src/server/services/admin-menu.ts`, (4) records an audit entry, and (5) expires public caches. A unit test fails if a new action is exported without being covered by the authorization check.
- **Mass assignment.** The schemas in `src/lib/validation/admin-menu.ts` list the fields an admin may set. Form posts carry Next's own `$ACTION_*` fields, so unknown fields are **dropped** (never written) rather than rejected. The add-ons JSON uses `.strict()` and is rejected on unknown keys. `id`, `slug`, `isDemo` and the timestamps can never be set from a form.
- **Slugs are generated and stable.** A new item or category gets a unique slug from its name (`masala-fries`, `masala-fries-2`, …). Renaming keeps the slug, so shared links and printed QR codes keep working. This differs from PRD FR-034/035, which listed the slug as editable.
- **Delete rules (A-03).** Archive is the normal "delete". Hard delete needs the item to be archived first and not used by any offer or combo. A category must be archived and empty. Both go through confirmation dialogs.
- **Freshness (FR-047, 30 s).** After each change the action calls `updateTag('menu')` and `updateTag('item:<slug>')`, which cover the cached data loaders, plus `revalidatePath('/', 'layout')`, which covers the prerendered page shells.
  - Measured on Next 16.4: with `updateTag` alone, `/menu/[slug]` kept serving its stored shell until the 30 s window ran out. Re-rendering the small public site once after an edit is cheap.
  - Do not add `refresh()` after `updateTag`: it downgrades the action's revalidation to "dynamic only".
  - E2E checks the public page within a 10 s budget after warming its cache.
- **Images (ADR-015 as built).**
  - **Validation.** Maximum 5 MB. The magic bytes must be JPEG, PNG or WebP; the file name and the browser's MIME type are ignored. Each side must be 200–6000 px, and `limitInputPixels` guards against decompression bombs.
  - **Re-encoding.** Every accepted file is decoded and re-encoded with `sharp` 0.35.5 (already installed as a Next.js dependency, now pinned explicitly) to WebP, at most 1600 px wide. This drops EXIF/GPS data and anything appended to the file.
  - **Storage.** Path `items/<itemId>/<uuid>.webp`. Upload goes through `@supabase/supabase-js` with `SUPABASE_SECRET_KEY`, server only, into the `public-media` bucket. The bucket has no write policies for `anon` or `authenticated`.
  - **Limits.** At most 4 images per item, matching the `MenuItemImage_sort_range` CHECK. Images can be replaced in place, reordered (the first one is the main photo) and removed.
  - **Cleanup.** File removal is best effort and never fails the action.
  - **Without the key.** If the key is not set, the editor says uploads are off, instead of showing a form that fails.
- **Server Action body limit** is raised to 6 MB (`experimental.serverActions.bodySizeLimit`), for the 5 MB image plus multipart overhead. The action checks the size again.
- **Not built:** drag-and-drop ordering, and bulk edit. Neither is in the PRD.

## ADR-050 Offers, banners, café info and gallery administration as built — Accepted (2026-10-16, Phase 5C)
- **Same action pattern as ADR-049.** `src/features/admin/content-actions.ts`: `requireAdmin` → Zod (`src/lib/validation/admin-content.ts`) → service (`src/server/services/admin-content.ts`) → audit → cache expiry. The shared helpers now live in `src/features/admin/action-utils.ts` (a server-only module, not `'use server'`, so nothing in it can be called from the browser). A unit test fails if an action is exported without the authorization check.
- **No `redirect()` in data-changing actions.** Create and delete actions return `redirectTo`, and the client navigates with `router.push`.
  - Why: Next 16.4's action handler (`app-render/action-handler.js`) passes a redirecting action's pending cache invalidations to the internal render of the redirect target, instead of completing them like a normal action response.
  - Returning a URL keeps one code path for every mutation. The E2E tests warm `/offers` and `/menu?q=…` before creating content and check that the new entry appears.
  - Sign-in and sign-out still redirect: they change no public data.
- **Freshness limits, measured.**
  - A warmed public page shows the change about 0.1–0.2 s after the save (item availability 140 ms, new offer 104 ms).
  - Edge case: a public page whose render is still being written to the cache at the moment of the save can keep the old copy until its 30 s window ends. That is still within FR-047 (≤30 s).
  - The tests wait 2 s after warming, so they check the on-demand path. Each public check also waits up to 2 s, because the page content arrives streamed.
- **Offers.**
  - Types: COMBO (needs at least one item and a price), DISCOUNT (needs a price), INFO (has no price). This matches the `Offer_price_matches_kind` CHECK.
  - "Ends" must be after "Starts". Admins type dates in **India time** (`datetime-local`, parsed as UTC+5:30), and dates are stored in UTC.
  - Items are chosen with quantities 0–20; at most 10 items, no duplicates, and the IDs are re-checked in the transaction.
  - "Expire now" sets `expiredAt`, and the public site hides the offer at once. "Reactivate" works only while the end date is in the future.
  - Delete removes the offer and its item links, never the menu items. The slug is generated and stable (ADR-049).
- **Banners.**
  - The link must be an internal path (`/offers`, not `//host`, no backslashes) or an `http(s)` URL without credentials. `javascript:`, `data:`, `vbscript:` and control characters are refused (`isSafeHref`, CLAUDE.md §4.4 / §9.5).
  - Button text and link go together. The optional show window must be in order.
  - An image is required (Storage).
- **Café info.**
  - Instagram and Facebook links must be https on the network's own domain, with a path.
  - Other rules: WhatsApp is digits only (the DB CHECK); PIN is 6 digits; latitude/longitude are given both or neither, within range, with up to 6 decimals.
  - The "verified" checkboxes control the placeholder labels on the public site.
  - Saving sets `isDemo = false`.
- **Opening hours.** All 7 days are saved in one transaction, as same-day ranges (past-midnight ranges are Q-05). A time picker cannot show 24:00, so a closing time of "00:00" means midnight.
- **Gallery.**
  - Upload uses the same validation and re-encoding as item images (ADR-049), stored at `gallery/<uuid>.webp`.
  - Alt text is required; the caption is optional. Photos can be published or unpublished, moved earlier or later (renumbered in one transaction), and removed (Storage cleanup is best effort). Maximum 200 photos.

## ADR-051 QR menu, feedback and moderation as built — Accepted (2026-10-16, Phase 6)
- **QR (ADR-018 as built).**
  - `qrcode` 1.5.4 (and `@types/qrcode` 1.5.6), both pinned exactly; `npm audit` shows 0 production findings.
  - `src/server/qr.ts` encodes `new URL('/menu?src=qr', NEXT_PUBLIC_SITE_URL)` with error correction level M and a 4-module quiet zone. It never uses the request's host, so a printed code cannot point at whatever address served the page.
  - `GET /api/v1/qr?format=svg|png[&download=1]` serves the image, with `nosniff`. The SVG also gets a sandboxing CSP.
  - `/qr` shows it as an `<img>`, so there is no `dangerouslySetInnerHTML`.
  - `/admin/qr` warns when the URL is localhost, a LAN address or plain http.
  - Production still refuses a localhost or http site URL at startup (`src/lib/config/env.ts`).
- **Feedback is a Server Action, not `POST /api/v1/feedback`.** Next.js makes it POST-only and checks the Origin header (CSRF); it uses the same validation as an API would.
  - Message 10–1000 characters, optional name up to 40. Control, zero-width and bidi-override characters are removed, because they can hide or reverse text shown to moderators. Line breaks are kept.
  - Every submission is stored as `PENDING`; a client cannot set the status.
- **Abuse protection.**
  - **Honeypot.** A hidden `website` field: when filled, the guest sees "thanks" but nothing is stored, and no rate-limit count is spent.
  - **Rate limit.** 3 submissions per 10 minutes per IP (`RULES.feedbackPerIp`, Postgres with HMAC keys, ADR-014).
  - **Length limits and moderation.** Nothing is public before an admin approves it.
- **Moderation.**
  - `/admin/feedback` has pending, approved and rejected tabs with counts, 20 per page. Approve and Reject take one click; Delete asks for confirmation.
  - Each change records who moderated it and when. The audit entry never includes the guest's text or name.
  - Approve and reject expire the `home` tag and the page shells, so the home and contact pages change immediately.
  - Guest text is rendered by React as text (`whitespace-pre-line`), never as HTML. E2E checks that an `<img onerror>` payload is shown literally and never runs.
- **Retention (SECURITY.md §10).** Rejected feedback is deleted 90 days after it was rejected, by `purgeOldRejectedFeedback()` when an admin opens the moderation page. That is one indexed delete, so no scheduler is needed.
- **Navigation.** `/feedback` and `/qr` are live in the footer and the mobile "More" sheet; Feedback and QR code are live in the admin sidebar.

## ADR-052 Admin session lifetime: browser session, 30 min idle, 12 h maximum — Accepted (2026-10-16, Phase 6 Round 2)
- **Team report:** opening `/admin` after a break went straight in without asking for a password. Supabase refresh tokens last weeks, and `@supabase/ssr` stores them in cookies that last 400 days.
- **Decision:**
  1. **Browser-session cookies.** Every admin cookie, including the Supabase auth cookies, has no `Max-Age`/`Expires` (`sessionOnly()` in `src/server/auth/activity.ts`), so closing the browser signs the admin out. Cookie deletions keep `Max-Age=0`, so sign-out still works.
  2. **Server-enforced idle and maximum time.** A browser that restores the previous session would keep session cookies alive, so the server also enforces limits with an HMAC-signed `zorko_admin_activity` cookie (HttpOnly, path `/admin`).
     - Contents: Supabase `session_id`, sign-in time, last activity.
     - Signing key: derived from `RATE_LIMIT_SALT`, so there is no new variable to set.
     - The cookie is bound to the session ID, so one copied from another session is refused.
     - The proxy refreshes it on every admin request. When it is missing, invalid, idle for more than **30 min**, or older than **12 h**, the proxy signs the Supabase session out and redirects to `/admin/login?expired=1` ("Your session expired").
  3. **`requireAdmin()` checks it again** (read-only), so the proxy is never the only check (ADR-010).
- **Login** sets the cookie only after the allowlist check. **Logout** deletes it.
- **Tests:** unit (idle, maximum, tampering, foreign session, wrong key, future date, cookie options); E2E in Chromium and WebKit:
  - cookies have no expiry;
  - an edited timestamp ends the session and clears the Supabase cookies;
  - a missing activity cookie ends the session.
- **Trade-off.** An admin who stays idle for 30 minutes must sign in again; unsaved form input is lost. Acceptable for a few admins on a small site. The limits are constants in `activity.ts`.

## ADR-053 Phase 7 hardening decisions — Accepted (2026-10-16)
- **CSP script policy (closes ADR-016).** `'unsafe-inline'` stays in `script-src`; it is accepted as residual risk R-07.
  - **Tested option 1, experimental SRI with `script-src 'self'`:** the build works, but Next 16 streams page data through inline `<script>` tags, so the policy blocks 24 scripts on `/` and pages stop hydrating.
  - **Option 2, nonces:** these force every page to render dynamically and disable PPR/caching (Next CSP guide), which conflicts with ADR-013.
  - **What remains in the policy:** `'unsafe-eval'` is not allowed in production, plus `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, and `img-src` / `connect-src` limited to the app and the Supabase host.
  - **Main XSS defence:** React escaping, plus the lint ban on `dangerouslySetInnerHTML`, verified with stored-XSS E2E tests.
- **Zod jitless.** Zod 4 probes `new Function()` the first time it runs. In the browser that is a CSP violation (found by Lighthouse on `/menu` and `/feedback`). `z.config({ jitless: true })` runs in `src/lib/validation/zod-setup.ts`, which every validation module imports first.
- **Metadata streaming.** Next 16 streams metadata to browsers and to Googlebot (Google runs JavaScript), but sends it blocking to Bingbot, Facebook, WhatsApp, Twitter, Slack and others (its default list). Lighthouse therefore reports "no meta description" on the dish page, a known false negative: the tag is in the HTML, and in `<head>` for the bots that need it. Default kept, as Next recommends.
- **Favicon:** `src/app/icon.svg` (the header "Z" mark). It removes a 404 on every page.
- **Static authorization guard:** `tests/unit/authz-guard.test.ts` fails if an admin page or exported Server Action does not await `requireAdmin()` before anything else.
- **Lighthouse** runs from a temporary folder outside the repository (like ADR-027): `lighthouse` 13.5.0 using Playwright's Chromium. It is not a project dependency.

## ADR-054 Page width 1480 px through one token — Accepted (2026-10-28, Phase 7 Round 2A)
- **Context.** The team asked for less empty space at the sides on wide monitors and when zooming out (a change first tried in an unofficial copy of the project).
- **Decision.** One theme token `--container-page: 1480px` (Tailwind class `max-w-page`) replaces every hard-coded `max-w-[1280px]`: `Container`, header rows, demo ribbon and footer. Side margins (16/24/40 px) and breakpoints are unchanged.
- **Consequences.** Every page row widens together, so header, sections and footer stay aligned. Visual baselines were re-recorded as a deliberate design change. UI_SPEC §4 updated.

## ADR-055 Official logo and "Staff portal" link — Accepted (2026-10-28, Phase 7 Round 2A)
- **Logo.** The team supplied the ZORKO logo and asked for it on the site (answers Q-09 for this student project). `public/logo.webp` (246×105) replaces the "Z" text mark in `Logo` (header and admin sign-in); the original file is kept in `design/brand/`. The image is decorative (`alt=""`) because the link's `aria-label` names it. The favicon stays the "Z" mark.
- **Staff portal.** A link to `/admin/login` in the footer, the phone "More" sheet and the tablet drawer (shared `StaffLink`). It is only a shortcut: admin access is still decided by `requireAdmin()` on the server (ADR-010). Showing where the sign-in page is does not weaken it; the page already existed at a guessable URL and is rate-limited.
- **Not adopted from the unofficial copy:** its separate admin cookie holding the raw admin ID (forgeable, bypassed Supabase Auth), its raw-SQL password check against `auth.users`, the fake newsletter form, and its footer colours outside the design tokens.

## ADR-056 Outlet photos from the team as local files — Accepted (2026-10-28, Phase 7 Round 2A)
- **Context.** Storage uploads are still off (no `SUPABASE_SECRET_KEY`), but the team supplied photos of the outlet.
- **Decision.** Five photos in `public/photos/` (WebP, ≤1600 px, metadata such as GPS stripped). `mediaUrl()` accepts `photos/<name>.webp` like the other local prefixes (same strict pattern, no `..` or sub-folders). `npm run gallery:outlet-photos -- add` registers them as real (`isDemo=false`), published gallery rows; it only adds missing rows and never deletes. Admins then manage them in Admin → Gallery (order, alt text, publish, remove; removing a local photo deletes only the row).
- **Excluded on purpose.** Three images in the unofficial copy (`central-aisle`, `order-counter`, `dining-table`) are AI-generated re-imaginings of the room (wine glasses, staged diners, unreadable menu boards). Showing them as the café would be fabricated outlet content (CLAUDE.md rule 12). Three other photos (`PLACE 3/4/5`) show interiors that differ from the rest; they wait for the team to confirm they are the Sangli outlet (Q-21).

## ADR-057 Next.js 16.4.3 security upgrade — Accepted (2026-10-28, Phase 7 Round 2A)
- `npm audit` reported **critical** advisories for next 16.0.0–16.4.0 (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr: unauthenticated RCE; GHSA-p3m5-59mp-jv5r: DoS) and a moderate one for `fast-uri`. Upgraded `next` and `eslint-config-next` to 16.4.3 (patch release, exact pin) and ran `npm audit fix` for `fast-uri`. `npm audit --omit=dev`: 0 vulnerabilities. All suites re-run (Round 2A report).

## ADR-058 Round 2A fixes: brand assets from zorko.in, balanced footer, admin reset — Accepted (2026-10-28, Phase 7 Round 2A fixes)
- **Permission.** The team states the franchise owner allows the project to use ZORKO's logo and photos. Recorded here as the team's assertion; this project cannot verify it.
- **Logo.** `public/logo.webp` is now the official 1186×452 logo from zorko.in, re-encoded to 600 px wide (previous file was 246 px and looked soft on high-density screens). `public/logo-plain.webp` (no white outline, from the zorko.in footer) sits in the footer.
- **Footer.** The fourth grid column used to render only when social links exist (none are confirmed yet), which left the right quarter empty. It is now always present: the ZORKO logo, right-aligned on desktop (bottom-right on tablet), with social links below it once confirmed.
- **Gallery.** Added 3 photos of other ZORKO cafés (`PLACE 3/4/5`, answers Q-21) and 4 official ZORKO food photos (zorko.in hero images, transparency flattened onto `surface-warm-cream`). Captions say "A ZORKO café (brand photo)" / "ZORKO brand food photo", and the page intro says the gallery mixes the Sangli outlet and brand photos, so nothing is presented as taken at Sangli when it was not (rule 12).
  - **Rejected from zorko.in:** its "outlet" images are promotional posters for other cities (with their addresses and phone numbers), and the small product shots are under 230 px.
  - **Not used:** third-party photos on Google Maps or Zomato. They belong to the people who took them, so the owner's permission does not cover them.
  - **Re-encoding.** All downloaded files were re-encoded through `sharp` (no original bytes or metadata kept).
- **Broken gallery rows.** `npm run gallery:outlet-photos -- repair` re-points the 2 rows added by the unofficial copy (missing files) to `zorko-cafe-blue-booths.webp` / `zorko-cafe-floral-ceiling.webp`. It updates rows; nothing is deleted.
- **Admins.** No Supabase password worked: one account had never signed in through Supabase Auth (its password was set in the database directly and only worked through the unofficial copy's raw-SQL login), and the other's password had changed. At the team's request both allowlist rows were **disabled** (`admin:disable`, audit history kept). New admins are created through the Supabase dashboard and `admin:add` (DEPLOYMENT.md §6). Accounts are never inserted directly into `auth.users`.

## ADR-059 Brand redesign of header and footer in the zorko.in style — Accepted (2026-10-28, Phase 7 Round 2B)
- **Context.** The team asked for the footer to look like zorko.in, for a better header, and for one consistent look across the site, using zorko.in's colours (owner's permission, ADR-058). This deliberately changes the approved Stitch header/footer (CLAUDE.md 6.6: reason stated, UI_SPEC updated, applied everywhere).
- **Colours.** zorko.in's most-used colours become tokens: `brand-orange` #fb6514, `brand-yellow` #fbe414, `brand-blue` #04aded, `brand-ink` #000, plus `brand-ink-soft` and `brand-plank` (UI_SPEC §2.4). Orange on white is only 3.01:1, so on white it is used for marks and lines only. Text and buttons on white keep `primary` #a93200, so contrast results stay valid.
- **Footer.** zorko.in's wave/skyline and food-strip artwork (re-encoded; the wave's white sky made transparent by a flood fill from the top edge, the strip's light edge columns trimmed). The outlet's own content goes on black. Not copied: ZORKO Limited's corporate addresses, emails, subscribe form and copyright line (not this outlet's; a subscribe form without a backend would be a fake control).
- **Header.** One black block (team feedback: the logo looks better on black, as on zorko.in): info line and main row together, official logo, light text nav with the current page in orange plus an orange underline, dark pill search, an orange "Call" button (`tel:`, only with a phone number), orange focus outlines (6.97:1), and a 3 px orange rule.
- **Site-wide.** The homepage "At a glance" band moved from `bg-primary` to the same black band with orange rules. `PureVegPill` gained `tone="dark"` (white pill, 6.75:1) for black surfaces, and no longer wraps.
- **Build note.** Turbopack kept a stale CSS chunk after `globals.css` gained new tokens; `rm -rf .next` before building fixed it. Documented in the report's troubleshooting.

## ADR-060 Site-wide UI refinement: ZORKO palette, Inter + DM Sans, real food imagery — Accepted (2026-10-28, Phase 7 Round 2B part 2)
- **Context.** The team's design brief: the site looked generic (repeated icon cards, peach icon circles, weak hierarchy). It asked for the ZORKO palette, Inter headings, DM Sans body, real food photography for categories, a stronger Popular Picks section, and no regressions. It also said to keep the architecture and footer.
- **Tokens, not components.** The existing Stitch token names are re-pointed (`primary` → ZORKO brown #a54e30, `surface` → #faf7f4, `on-surface` → #211c19, `on-surface-variant` → #76645a, containers → warm neutrals, `surface-warm-cream` → #fff3e7, `brand-orange` → #ff7916, `brand-ink` → #111111). New tokens: `cta`, `cta-hover`, `on-cta`, `border`, `brand-ink-raised`, `brand-peach`. Every component picks the palette up without being rewritten.
- **Contrast decisions (deviations from the brief, for WCAG AA):**
  - **Primary buttons:** orange #ff7916 with **near-black text #211c19** (6.43:1; 5.09:1 on hover #e8660a). The brief's white text on that orange is 2.63:1 and fails.
  - **Muted text:** #8c817a (3.55:1) is not used for small text; metadata uses #76645a (5.26:1).
  - **Surface containers:** chosen so that secondary and brown text stay ≥4.5:1 on them (#f1eae4, #eee7e1).
  - **Green #16845b** is 4.39:1 on the page background, so it is used for veg marks only; veg text keeps `tertiary`.
- **Typography.** Inter (600/700/800) for headings and DM Sans (400–700) for body, self-hosted by `next/font` as before (ADR-007).
  - Hero `clamp(2.5rem…3.5rem)`, line height 1.08.
  - Section headings `clamp(1.875rem…2.25rem)`.
  - Body 16 px with line height 1.55, lead text 17 px with 1.65.
  - Labels and buttons 15 px / 600; metadata 13 px.
- **Category thumbnails.** Official ZORKO menu photography from zorko.in (`best-fast-food-1-N.webp`, owner's permission, ADR-058), cropped to the dish (the zorko.in cards also carry ZORKO-wide item counts, which are not Sangli's). All 16 real categories have a matching photo (Ice Tea, which has no zorko.in menu card, uses the ZORKO-branded glass from zorko.in's printed menu board `menu-6.jpg`, added 2026-10-28 at the team's request); admin-created categories keep a clean icon fallback (no stand-in photos). `src/features/menu/category-photos.ts`; images are decorative because the card text names the category.
- **Homepage.**
  - **Hero:** warm off-white with one faint peach glow; feature tiles are white with a border and a plain brown icon (no tinted squares).
  - **Category cards:** photo 4:3 + name + count, 2/3/4/6 columns, orange border on hover. Categories with 0 visible items are skipped on the homepage only.
  - **Popular Picks:** peach `#fff3e7` band with borders and more vertical space.
  - **Gallery block:** retitled "A Look Around ZORKO", because the gallery now also holds other ZORKO cafés' photos.
- **Cards and buttons site-wide.** Menu cards use a 1 px border instead of a shadow, with an orange border on hover; Popular Picks images are 4:3. Section eyebrows get the hero's short orange rule. Secondary buttons are white with a border and brown text.
- **Footer and header.** Kept (ADR-059). Orange is now #ff7916 via the token, the header search uses `brand-ink-raised` #1d1d1d, and the footer hours have more line spacing.
- **Not changed:** routes, data, filters, search, `tel:` actions, admin logic.

## ADR-061 Admin quick edits and table QR cards — Accepted (2026-10-28, Phase 7 Round 2C)
- **Context.** The team asked for the unofficial copy's admin conveniences (inline ₹ price, one-click labels) and table QR cards 1–20 with bulk printing and PNG/SVG downloads, built on the existing secure actions instead of porting the copy's code.
- **Quick edits.** Two new Server Actions, `setPriceAction` and `setItemFlagAction`, follow the same pattern as `setAvailabilityAction`: `requireAdmin()` first, Zod validation of every argument (ID format; price via the item form's own rupees→paise rule, > ₹0 and ≤ ₹1,00,000; flag from the fixed enum `isBestSeller | isTrending | isFeatured`, so a client cannot set `isArchived`, `isDemo` or any other column), an audit entry, and expiry of the public cache tags. The database CHECK on price still applies. In the item list the price is a field that saves on Enter or when focus leaves it (Escape restores), and the labels are `aria-pressed` toggles; both are optimistic and revert on a refused save. "+ Add dish" already existed as **New item**.
- **Table cards.** `/api/v1/qr` accepts `table=1…20` (strict: `05`, `1.5`, `21` → 400) and encodes `/menu?src=qr&table=N`. The table number is informational only: it is not stored or tracked, and there is no table ordering (CLAUDE.md §3.0). Files download as `zorko-sangli-table-N-qr.png|svg`. `/admin/qr` shows the 20 cards (logo, "Table N", code, "Scan to see our menu"); **Print all 20 cards** uses the browser's print dialog, with print styles that hide the admin navigation and everything except the cards (two per row, dashed cut lines). The count is the `TABLE_COUNT` constant in `src/features/qr/tables.ts`.
- **Alternatives rejected.** A JSON "update any field" action (mass-assignment risk); generating a PDF on the server (new dependency; the browser's "Save as PDF" covers it); storing tables in the database (no feature needs it yet).

## ADR-062 Feedback quick highlights stored as an enum array — Accepted (2026-10-28, Phase 7 Round 2D)
- **Context.** The team asked for the unofficial copy's feedback "quick tags". The copy appended the tag text to the message, so tags were free text a guest could edit into anything, and they could not be shown or counted separately.
- **Decision.** A fixed list of six highlights (`TASTY_FOOD`, `QUICK_SERVICE`, `FRIENDLY_STAFF`, `GREAT_AMBIENCE`, `GOOD_VALUE`, `STUDENT_FRIENDLY`; labels in `FEEDBACK_TAGS`, `src/lib/validation/feedback.ts`) stored in `Feedback.tags`, a Postgres enum array with an empty default. Additive migration `20261028120000_feedback_tags`; existing rows get `{}`. The form sends one `tags` value per ticked checkbox; Zod accepts known keys only (max 6), drops duplicates and keeps list order; the enum refuses anything else even from raw SQL. The labels are the guest's opinion, not claims by the café; dish-specific labels from the copy ("Loved the Mojitos") were not used.
- **Display.** Ticked highlights show as small chips in admin moderation and on approved reviews (home/contact). Unapproved feedback stays private as before. The pills are real checkboxes (visually hidden input inside a `relative` label), so keyboard and screen-reader behaviour is native.
- **Alternatives rejected.** Text appended to the message (the copy's approach: editable, not structured); a separate `FeedbackTag` table (a join for six fixed values adds nothing); a rating score (not requested; the synopsis has no ratings and CLAUDE.md §6.2 forbids invented ratings).

## ADR-063 Homepage polish: less decoration, authentic hero photo — Accepted (2026-10-29, Phase 7 Round 2E)
- **Context.** Team brief "Final Homepage Polish": keep the black/orange identity, remove decorative dashes and generic icon styling, present food better, show only trustworthy information.
- **Changes.** Eyebrows lose the short orange dash (hero and `SectionHeading`, so every page). Hero: the fallback photo is ZORKO's own paneer burger (`/photos/brand-paneer-burger.webp`, ADR-058) instead of a Wikimedia stock burger that was shown without a label; peach glow removed; square framed image; the item-count label sits inside the frame without an icon tile; CTAs without decorative icons; feature tiles become a plain list. "At a glance" strip: plain orange icons instead of filled orange circles. Popular Picks: photos edge to edge (see bug below).
- **Bug fixed.** `MenuCard`'s trending variant relied on `cn()` to replace `md:p-space-md` with `md:p-0`; tailwind-merge does not know the custom `space-*` scale, so the grid padding stayed and photos were inset. Padding is now chosen per variant.
- **Kept because the data is real.** Category photos (ZORKO's own, ADR-060), "Best seller"/"Trending" (admin flags), "Available"/"Out of stock" (admin availability switch), "N items" (database count), hours with "(to be confirmed)", the footer.
- **Not changed in code.** Guest Feedback shows only APPROVED feedback and hides itself when there is none; the one approved review in the dev database is the team's own test, so the team rejects or deletes it in Admin → Feedback (data, not code).

## ADR-064 Hero refinement and test-review clean-up — Accepted (2026-10-29, Phase 7 Round 2F)
- **Hero.** Desktop columns 6/6 (was 7/5). New asset `public/photos/brand-paneer-burger-hero.webp`: a 700×560 crop of the ZORKO brand photo around the burger (it filled about 70 % of the width, now about 90 %); frame `aspect-[5/4]`, max 560 px. It is a brand photo, not a verified menu item, so the alt text does not name a dish or price. The item count sits on the frame's bottom edge so it never covers the food. Spacing uses explicit margins (eyebrow → H1 `sm`, → lead `md`, → CTAs `lg`, → feature list `xl` + `lg` padding above the hairline).
- **Hours chip removed from the hero.** It repeated the top info bar, the "At a glance" strip, Visit us and the footer, which all keep the hours and the "(to be confirmed)" note.
- **"(to be confirmed)" stays** wherever hours are shown: `CafeInformation.hoursVerified` is false. It is removed only by ticking "Opening hours confirmed" in Admin → Café info once the café confirms the hours (CLAUDE.md rule 12). Address, contact and map are already verified.
- **Test data.** At the team's request the team's own test review was deleted from the dev database (1 row, approved, "food was good indeed."). The dev database has no other demo rows (`isDemo` = 0 in every table). Guest Feedback hides itself until real feedback is approved.
- **Categories.** More space above "Explore menu categories" (`md:pt-[4.5rem]`) so the heading does not sit tight under the black strip.

## ADR-065 Team-supplied hero burger photo — Accepted (2026-10-29, Phase 7 Round 2G)
- The team supplied a portrait burger photo (736×1308). Saved as `public/photos/hero-burger.webp` (re-encoded, EXIF stripped, not upscaled). It replaces the ZORKO brand-photo crop as the hero fallback; an admin banner image still wins.
- Frame: `aspect-[4/5]`, `rounded-3xl`, dark `bg-brand-ink` behind the photo, no border or shadow; `object-cover object-[50%_40%]` keeps the whole stack (bun to board) in view. Width 400 / 440 / 480 / 520 px (mobile / md / lg / xl). The item count stays on the frame's bottom edge, over the board.
- Alt text says "illustrative photo" and names no menu item. **Open risk for the team:** the photo shows what look like meat patties, while the site shows a "100% VEG" badge; its source and licence are unknown. Replace it with a veg burger photo the café owns if either is a problem (one constant, `HERO_FALLBACK`).

## ADR-066 Deployment readiness: preflight, artifact scan, pinned runtime — Accepted (2026-10-29, Phase 8)
- **Runtime.** `engines.node` pinned to `22.x` (was `>=22.13.0`): Vercel picks the newest Node for open ranges, while every test ran on Node 22. `vercel.json` sets the function region `bom1` (closest to Sangli; same region as the recommended Mumbai Supabase project).
- **Preflight** (`npm run preflight -- <file>`, `scripts/preflight.mjs`): validates a production env file by variable name only: required variables, https non-localhost non-IP site URL, pooler ports, salt length, no secret in `NEXT_PUBLIC_*`, all Supabase values on one project, and **not** the dev project or the dev salt; no test-only variables. Unit-tested (TC-UNIT-125).
- **Artifact scan** (`npm run scan:build -- <file>`, `scripts/scan-build.mjs`): after a build, checks that no server-secret value appears in `.next/static` or prerendered pages. Negative-tested with a planted value (detected).
- **Production command pattern.** Production values live in a git-ignored `.env.prod-admin`, loaded only in a subshell with `VERCEL_ENV=production` so the scripts' guards stay on; `.env.production(.local)` is forbidden because Next.js and the Prisma CLI load it automatically. `db:import-menu` now follows the same rule as the admin and gallery scripts: refused in production unless `--production` is given (it was refused with no supported path before). Verified with a dry run against the local test database.
- **Not done (needs the team):** creating the production Supabase project, production migrations, the Vercel project and deployment (CLAUDE.md rule 14).
