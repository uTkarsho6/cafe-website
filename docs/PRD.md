# PRD — ZORKO Sangli Smart Café Digital Platform

**Version:** 1.0 (Phase 1), 2026-10-13
**Sources:** `docs/source/synopsis.pdf` (functional), `CLAUDE.md` (engineering rules), `docs/UI_SPEC.md` (visual)
**Priorities:** **M** = Must (release-blocking) · **S** = Should · **C** = Could

## 1. Overview and problem

ZORKO Café, Sangli has no dedicated website. Customers cannot easily see the menu, prices, availability, offers, timings or location, and staff cannot update that information themselves.

This project delivers:
- a responsive public website with a QR-accessible digital menu;
- a secure admin panel through which café staff keep content current;
- one PostgreSQL database behind both.

## 2. Objectives (from synopsis §3)

| ID | Objective | Measured by |
|---|---|---|
| O-1 | Responsive website for ZORKO Sangli | NFR-001, TC-RESP-* |
| O-2 | Digital menu with items, offers, café info | FR-003…FR-017 |
| O-3 | Admin panel for menu, prices, offers, availability | FR-030…FR-047 |
| O-4 | QR menu, live availability, best sellers, student offers | FR-018, FR-022, FR-013, FR-015 |
| O-5 | Scalable foundation for future ordering/payments/accounts | Schema and module boundaries (TRD §4); no UI shipped |

## 3. Personas

| Persona | Needs | Device |
|---|---|---|
| **Walk-in customer** (scans the table/counter QR) | See what's available and prices, fast, with no login | Phone, outdoor/indoor light |
| **Student** (nearby colleges) | Budget items, combos, Student Zone offers | Phone |
| **Planner** (family/friends deciding where to eat) | Menu, offers, hours, location, photos, reviews | Phone/desktop |
| **Café staff / admin** | Update availability in seconds; edit menu, prices, offers, banners, info, gallery; moderate feedback | Phone at the counter, desktop |
| **Project guide / examiner** | Working features, clean architecture, security evidence | Desktop |

## 4. User stories (key)

- **US-01** As a customer, I scan the QR code and land directly on the menu without logging in.
- **US-02** As a customer, I search "burger" with the category, price range and popular filters applied, and see only items matching all of them.
- **US-03** As a customer, I see clearly when an item is out of stock.
- **US-04** As a customer, I open an item to see its description, photos, price, available customisations, related items and combos.
- **US-05** As a student, I see the offers marked for students.
- **US-06** As a customer, I find the address, today's hours, phone, WhatsApp and directions.
- **US-07** As a customer, I leave feedback without giving my email or phone.
- **US-08** As an admin, I mark an item unavailable and customers see it within 30 seconds.
- **US-09** As an admin, I add, edit or archive items and categories, including prices and photos.
- **US-10** As an admin, I create a combo with a validity period; it shows only while active.
- **US-11** As an admin, I approve or reject feedback; only approved feedback is public.
- **US-12** As an admin, I update hours, contact details, social links and map location.
- **US-13** As an admin, I download the QR code for printing.
- **US-14** As the café owner, I trust that only allowlisted staff can change anything.

## 5. Functional requirements

### 5.1 Public site

| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-001 | Homepage | M | Shows branding, hero with **View Menu** and **View Offers** CTAs, active banners, menu categories with counts, up to 4 trending/best-seller items, featured combo, Student Zone teaser, today's hours, gallery preview, latest 3 approved reviews, contact/location block, footer. Each block with no data is hidden or shows its empty state; nothing is fabricated. |
| FR-002 | Navigation | M | Desktop nav (≥1280), drawer (768–1279), compact header with bottom nav (<768) per UI_SPEC §8; active page indicated with `aria-current`; footer on every public page. |
| FR-003 | Menu listing | M | `/menu` lists published, non-archived items of non-archived categories. Each card shows image, name, description excerpt, price, availability and badges; category list with real counts. |
| FR-004 | Search | M | Case-insensitive substring match on item name (`q`, trimmed, 1–60 characters). Special characters are treated literally. |
| FR-005 | Combined filters | M | Category, price band (ADR-022), popular only (best seller OR trending), offers only (has an ACTIVE offer). Filters combine with AND, plus search. Shareable URL state. |
| FR-006 | Sorting and reset | M | Sort options: popular first (default), price ascending, price descending, name A–Z, with a stable tiebreaker (`sortOrder`, then `id`). "Clear all" resets every filter and search. |
| FR-007 | Pagination | M | Server-side, default 12 per page, maximum 48. An out-of-range page returns an empty page with valid metadata (API) or redirects to the last page (UI). |
| FR-008 | List states | M | Loading skeleton; empty state with "Clear all filters"; error state with "Try again" that re-fetches. |
| FR-009 | Availability display | M | `isAvailable=false` items show "Out of stock" on cards and details and are never labelled available. Unavailable items still appear in listings (sorted after available ones when sorting by popularity). |
| FR-010 | Item details | M | `/menu/[slug]`: description, up to 4 images, price (discount shown when active), availability, best-seller/trending badges, veg mark, breadcrumb. Unknown or archived slug returns 404. |
| FR-011 | Add-ons display | M | Configured add-on groups are shown read-only: name, rule (required/optional, minimum/maximum), options and price deltas. Nothing is shown when none are configured. No cart controls. |
| FR-012 | Related items, frequently bought together, combos | M | Admin-managed `ItemRelation` (RELATED, FREQUENTLY_BOUGHT_TOGETHER) shown as linked cards; ACTIVE combos containing the item listed. Archived or unpublished related items are excluded. |
| FR-013 | Best sellers and trending | M | Driven only by the admin flags `isBestSeller` / `isTrending`; badges and the home section use them. No sales figures are shown. |
| FR-014 | Offers and combos | M | `/offers` lists ACTIVE offers by kind (combo, item deal, info) and a "Coming soon" block for SCHEDULED offers. EXPIRED offers never appear. Each offer shows its description, promotional price (if any), and start and end dates. Combo savings are computed from current item prices. `/offers/[slug]` shows details; expired, unpublished or unknown slugs return 404. |
| FR-015 | Student Zone | M | `/student-zone` shows the admin intro text and ACTIVE offers with `isStudentOffer`, plus a disclaimer that the website does not verify student status. |
| FR-016 | Gallery | M | `/gallery` shows published images in admin order with alt text; lightbox with keyboard support. |
| FR-017 | Café info and location | M | `/contact` shows address, phone (`tel:`), optional email (`mailto:`), WhatsApp link (`https://wa.me/<digits>`), Instagram/Facebook links, weekly hours with today highlighted, open/closed now (computed in IST), map embed and directions link when coordinates exist. All values come from the database; unverified values show "To be confirmed". |
| FR-018 | QR digital menu | M | `/qr` shows a scannable QR code encoding `${NEXT_PUBLIC_SITE_URL}/menu?src=qr`, with PNG and SVG download. `/menu` works with no login on mobile. Production refuses a localhost or http site URL (ADR-018). |
| FR-019 | Feedback submission | M | `/feedback` form with optional name (≤40 characters), message (10–1000 characters), honeypot, rate limit (ADR-014), server validation, and loading, success and error states. Stored as PENDING. |
| FR-020 | Public reviews | M | Only APPROVED feedback is displayed (home and contact), rendered as escaped text, newest first. |
| FR-021 | SEO | M | Per-page `title`/`description`, canonical URL, Open Graph tags, `sitemap.xml` (public routes plus item and offer slugs), `robots.txt` (disallow `/admin`, `/api`). |
| FR-022 | Live availability | M | After an admin changes availability, price or publication, the public pages reflect it within 30 seconds without a manual cache clear (ADR-013). |
| FR-023 | Structured data | C | `CafeOrCoffeeShop` JSON-LD only after the café verifies its details (Q-01…Q-04). |
| FR-024 | Demo labelling | M | While any `isDemo` content is publicly visible, a "Demo data" ribbon is shown (ADR-025). |
| FR-025 | Error pages | M | Branded 404 and error pages without technical details. |

### 5.2 Admin

| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-030 | Admin login/logout | M | `/admin/login` with Supabase email and password; no signup UI; public signup disabled in Supabase. Logout invalidates the session server-side and clears cookies. Generic error message on failure. |
| FR-031 | Allowlist authorization | M | Every admin page, Server Action and admin Route Handler checks a valid session **and** an active `AdminUser`. Anonymous users are redirected (pages) or get 401 (API). Authenticated users who are not admins get 403 / "Not authorised". Server code never trusts a client-supplied role or user ID. |
| FR-032 | Login protection and session expiry | M | Login is rate limited (ADR-014); an expired or invalid session leads to re-login with a safe internal `next` redirect. |
| FR-033 | Dashboard | M | Real counts: total items, available, unavailable, active offers, scheduled offers, pending feedback, published gallery images, plus the 10 latest audit entries. No revenue, orders or visitor charts. |
| FR-034 | Categories | M | Create, edit (name, slug, icon, order), archive and unarchive. Hard delete only when the category has no items, after confirmation. Unique slug. |
| FR-035 | Menu items | M | Create, edit (name, slug, description, category, price, diet type, flags, order) and archive. Hard delete only when unreferenced, after confirmation. Server validation; unknown fields are rejected. |
| FR-036 | Availability toggle | M | One-click toggle in the list and the editor; persisted; audited; public revalidation triggered. |
| FR-037 | Item images | M | Upload, replace, reorder and remove up to 4 images per item, with alt text. Validation per ADR-015. |
| FR-038 | Add-on configuration | M | Groups (name, min/max select, required) and options (name, price delta ≥0, order, available), saved in one transaction. |
| FR-039 | Item relations | S | Add or remove related and frequently-bought-together links (no self-links, no duplicates). |
| FR-040 | Offers and combos | M | Create and edit `DISCOUNT`/`COMBO`/`INFO` offers. Fields: title, slug, description, image, promotional price (required for DISCOUNT/COMBO, and below the regular price), linked items with quantities (DISCOUNT exactly 1, COMBO 2–10), start and end in IST (end after start), student and featured flags, publish. "Expire now" action available. |
| FR-041 | Banners | M | Create, edit, order, schedule, publish and remove. CTA link must be an internal path (`/…`, not `//`) or an `https://` URL (`http://` allowed in development only). |
| FR-042 | Café information | M | Edit address, phone, email, WhatsApp number, Instagram/Facebook URLs (https only, matching host), latitude/longitude (valid ranges), opening hours for 7 days (open < close, or closed), about text, Student Zone text, offer terms, pure-veg flag. |
| FR-043 | Gallery management | M | Upload (ADR-015), alt text (required, ≤150 characters), order, publish/unpublish, remove (also deletes the storage object). |
| FR-044 | Feedback moderation | M | List by status; approve, reject, delete (with confirmation). Each action is authorised and audited. |
| FR-045 | Audit log | M | Records admin ID, action, entity type and ID, a non-sensitive summary, and timestamp for every mutation and every login/logout. Admin-only read view, paginated. |
| FR-046 | Preview | S | "View public page" link from the item and offer editors; unpublished items are viewable by admins only. |
| FR-047 | Revalidation | M | Every successful mutation revalidates the affected public pages and tags (ADR-013). |
| FR-048 | Veg marking | S | Per-item `dietType` (VEG / NON_VEG / EGG) and a café-level `isPureVegConfirmed` flag controlling the "100% VEG" claims (UI_SPEC §7.5). |
| FR-049 | Admin QR | M | `/admin/qr` shows and downloads the QR code; warns if the site URL is not https. |
| FR-050 | Admin usability | M | Sidebar with active state, responsive layouts, loading, disabled, empty and error states, confirm dialogs for destructive actions, success toasts, visible logout. |

### 5.3 Food recommendations (added 2026-10-30, guide's request; design in RECOMMENDATION.md)

| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-060 | Demo feedback dataset | M | `npm run reco:generate` creates about 400 demo users, 1,400 visits and 2,400 ratings for the real published menu only, deterministically (same menu + seed → identical CSV export), in the team's feedback format plus `visit_id` (RECOMMENDATION §3). Rating distribution within ±3 points of the team's reference file. Rows are `isDemo`, stored in separate tables (never in `Feedback`), never returned by a public API or page. Refused on production without `--production`; never deletes existing demo rows without `--replace`. |
| FR-061 | Flavour tags and meal roles | M | Items carry 0–5 tags from the fixed list (RECOMMENDATION §2.1); categories carry a meal role (MAIN/SIDE/DRINK/DESSERT). Both are editable in the admin with server validation and audit; unknown values are refused by Zod and the database enum. Initial values are set by a create-only script and reviewed by the team. |
| FR-062 | Training and model runs | M | `npm run reco:train` and the admin "Retrain" compute COMPLEMENT and SIMILAR top-10 lists for every item (RECOMMENDATION §4) and store them as a versioned run with weights, counts and metrics. A run is activated only if it passes the quality gate (§5); otherwise it is stored as REJECTED with the reason and the active run stays. Only one run is active; activation is atomic. |
| FR-063 | Item page: Goes well with | M | `/menu/[slug]` shows up to 4 items of other meal roles: admin FREQUENTLY_BOUGHT_TOGETHER links first, then the active run, then the fallback chain (§4.6). Never the item itself, never unavailable, unpublished or archived items. Each card shows one reason chip from the fixed list (§6). Hidden when empty. |
| FR-064 | Item page: You may also like | M | Same rules with admin RELATED links first and the SIMILAR list; at most 2 items per category. |
| FR-065 | Help me choose | M | `/help-me-choose`, reachable from the menu, asks mood, budget and up to 3 flavour tags (all optional except mood), works without JavaScript (GET form, URL state), and shows 5 available suggestions with reasons; for "meal", each main has one pairing whose combined price stays within the chosen budget. Invalid URL values are ignored on the page. |
| FR-066 | Recommendation APIs | M | `GET /api/v1/menu/[slug]/recommendations` and `GET /api/v1/recommendations/suggest` per TRD §14.4: strict validation (400), 404 for unknown items, rate limited (429), safe errors, no scores, ratings, demo comments or internal IDs in responses. |
| FR-067 | Admin recommendations | M | `/admin/recommendations`: on/off switch, retrain, weights (integers 0–1000 per weight, at least one weight > 0), run history with activate/rollback (confirm), per-item inspection with score components. Every action requires an allowlisted admin, is audited and expires the `reco` cache tag. |
| FR-068 | Automatic retrain | S | Item create/archive/unarchive/publish/category change, tag edits and meal-role edits trigger one retrain after the response; concurrent triggers are coalesced (lock + pending flag). Availability and price changes do not retrain, but are reflected at read time within 30 s. |
| FR-069 | Evaluation notebook | M | `notebooks/recommendation.ipynb` runs top to bottom from the committed CSVs, reports RMSE/MAE (rating prediction) and HitRate@5, Precision@5, Recall@5 and coverage for random, popularity, content, CF, co-occurrence and hybrid, and exports `reference_scores.json`; the app's lists match it (TC-UNIT-140). |

## 6. Non-functional requirements

| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| NFR-001 | Responsive | M | No horizontal page scroll and usable navigation at 375/430/768/1024/1440 px; touch targets ≥48 px under 1024 px. |
| NFR-002 | Accessibility | M | WCAG 2.2 AA intent. axe: zero serious or critical violations on all pages. Keyboard-only completion of the main journeys. Visible focus. Dialog focus trap and restore. Reduced motion respected. |
| NFR-003 | Performance | S | Lighthouse (mobile, production build, local): Performance ≥85, Accessibility ≥95, Best Practices ≥95, SEO ≥95 on home, menu and item pages. These are targets; only measured numbers are reported. |
| NFR-004 | Security | M | SECURITY.md controls implemented and tested (TC-SEC-*); no unresolved critical or high findings at release. |
| NFR-005 | Privacy | M | Feedback collects no contact data. IPs are stored only as salted hashes in rate-limit buckets, pruned after 24 h. Rejected feedback is deleted after 90 days (manual or scheduled task, documented). |
| NFR-006 | Maintainability | M | TypeScript strict mode, ESLint clean, server-only modules guarded, non-obvious logic commented, decisions logged. |
| NFR-007 | Reliability | M | `/api/health` reports app and DB status; database errors return safe 5xx responses; UI error states offer retry. |
| NFR-008 | Freshness | M | Admin changes visible publicly within 30 s (FR-022). |
| NFR-009 | Browser support | M | Latest Chrome/Edge, Safari (iOS 17+), Firefox. Playwright runs Chromium and WebKit. |
| NFR-010 | Content honesty | M | No unverified claims (CLAUDE.md 6.2); demo data labelled. |
| NFR-011 | Deployability | M | Vercel + Supabase; reproducible setup from README/DEPLOYMENT; separate development and production projects. |
| NFR-012 | Data integrity | M | Money stored as integer paise; foreign keys; unique slugs; transactions for multi-record writes. |
| NFR-013 | Recommendation performance | S | Item page adds at most one indexed query for recommendations (cached 30 s, tag `reco`); suggest endpoint p95 < 300 ms locally; training < 5 s for 100 items × 5,000 ratings. Measured numbers only. |
| NFR-014 | Recommendation honesty | M | Public text never states ratings, counts, percentages, demo comments or behaviour derived from demo feedback; reason chips come only from the fixed list (RECOMMENDATION §6); the admin labels the data source as demonstration bills. |

## 7. Scope

- **In scope:** everything in §5 and §6.
- **Out of scope:** online ordering, cart, checkout, payments, delivery and order tracking, customer accounts, loyalty and rewards (synopsis D-01, open question Q-12), student-ID verification, table-side ordering, coupon redemption, analytics dashboards, multiple outlets, multiple languages.
- **Recommendations (added 2026-10-30):** trained on a demo feedback (ratings) dataset because there is no ordering or billing; real item feedback or billing data is future work (RECOMMENDATION §7). No personalisation, tracking or customer profiles.
- **Future-ready:** schema IDs and module boundaries allow `Order`/`Customer` tables and a cart feature to be added later without reshaping the menu tables.

## 8. Main journeys

1. **QR → menu:** scan, then `/menu?src=qr`, filter or search, open an item, go back (filters preserved).
2. **Browse → visit:** Home, Offers, Contact, Directions or WhatsApp.
3. **Feedback:** Home "Share feedback", form, success. The admin approves it and it appears on Home and Contact.
4. **Admin availability:** log in, open the menu list, toggle an item; the public page changes within 30 s.
5. **Admin offer:** create a combo with dates, publish, see it on `/offers` (or under "Coming soon"), use "Expire now", and it disappears.

## 9. Sitemap

```
/                       Home
/menu                   Digital menu (?q,category,price,popular,offers,sort,page,view,src)
/menu/[slug]            Item details
/offers                 Offers & combos (?kind)
/offers/[slug]          Offer details
/student-zone           Student Zone
/gallery                Gallery
/contact                About & Contact
/feedback               Feedback form
/qr                     QR menu code
/help-me-choose         Help me choose (?mood,budget,tags) — R4
/sitemap.xml, /robots.txt
/api/health, /api/v1/*  (TRD §6)
/admin/login
/admin                  Dashboard
/admin/menu, /admin/menu/new, /admin/menu/[id]
/admin/categories
/admin/offers, /admin/offers/new, /admin/offers/[id]
/admin/banners
/admin/cafe
/admin/gallery
/admin/feedback
/admin/qr
/admin/audit
/admin/recommendations  Recommendations (R5)
```

## 10. Assumptions (pending confirmation, also in PROGRESS.md)

A-01 Loyalty is out of scope · A-02 Supabase Auth + allowlist · A-03 Soft-archive · A-04 "Frequently bought together" = admin associations, with combos shown separately · A-05 Public reviews = moderated feedback, no ratings · A-06 Gallery is admin-uploaded only · **A-07 (revised) Homepage shows 4 trending items** (ADR-023) · A-08 Synopsis file choice · **A-09** Hover colour change for contrast (ADR-004) · **A-10** Header layout fixes (ADR-024) · **A-11** Feedback has no star ratings (ADR-026).

## 11. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Real café data not supplied before the demo | Site shows placeholders | Demo seed plus a documented replacement path; "To be confirmed" labels |
| Supabase free project pauses | Demo fails | Wake the project before the demo (DEPLOYMENT.md checklist) |
| Fast-moving library majors (Next 16, Prisma 7) | Build breaks or wrong APIs | Pin exact versions; read the installed version's docs (rule 24) |
| ZORKO brand permission unknown | Legal/brand risk | Text wordmark; neutral footer; Q-09 |
| Scope creep from mockup features | Fake controls | CLAUDE.md 6.3 list enforced in code review and the E2E "no ordering UI" test (TC-E2E-090) |

## 12. Open questions

See `docs/OPEN_QUESTIONS.md`.

## 13. Definition of Done (per requirement)

A requirement is done only when all of the following hold:
- it is implemented on the server and the client as specified;
- its acceptance criteria are covered by at least one automated test that passes (IDs in `TRACEABILITY.md`);
- it works at mobile and desktop widths;
- axe shows no serious or critical violations on the affected pages;
- no lint or type errors;
- the relevant docs are updated;
- the phase report shows the evidence;
- the team has approved the phase.
