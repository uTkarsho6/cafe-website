# PROGRESS — ZORKO Sangli Smart Café Digital Platform

Single source of truth for project state (CLAUDE.md Section 0.1).

**Resuming after an interruption?** Read `docs/WORKLOG.md` → "RESUME HERE". It records the last completed task and the exact next action, and is updated after every task.

## Current phase

| Field | Value |
|---|---|
| Current phase | **Phase R0 — Recommendation system: requirements and design** (post-release addition requested by the guide, 2026-10-30) |
| Status | **AWAITING TEAM VERIFICATION** |
| Branch | `phase-r0` (from `main`) |
| Latest report | `docs/PHASE_REPORTS/phase-r0.md` |
| Live site | https://zorko-sangli.vercel.app (deployed 2026-10-29 IST; auto-deploys from GitHub `main`) |
| Last updated | 2026-10-30 |

**Recommendation phases** (RECOMMENDATION.md; same loop as CLAUDE.md §0.2, one approval each): R0 design → R1 schema + demo feedback dataset → R2 Python notebook → R3 TypeScript engine + APIs → R4 public UI → R5 admin + go-live. Nothing reaches production before R5, and only with written approval.

## Approved phases

| Phase | Date | Approval message (quoted) |
|---|---|---|
| Phase 0 | 2026-10-13 | "approved, go to Phase 1" |
| Phase 1 | 2026-10-13 | "approved, go to Phase 2" |
| Phase 2 | 2026-10-13 | "approved, go to Phase 3" |
| Phase 3 | 2026-10-14 | "approved, go to Phase 4A" |
| Phase 4A | 2026-10-14 | "approved, go to Phase 4B" |
| Phase 4B | 2026-10-15 | "approved, go to Phase 5A" |
| Phase 5A | 2026-10-15 | "approved, go to Phase 5B, pls do it quickly u are taking a hell lot of time" |
| Phase 5B | 2026-10-16 | "approved, go to Phase 5C" |
| Phase 5C | 2026-10-16 | "approved, go to Phase 6" |
| Phase 6 | 2026-10-16 | "approved, go to Phase 7" |
| Phase 7 | 2026-10-29 | "approved, go to Phase 8" (incl. Rounds 2A–2G) |
| Phase 8 | 2026-10-29 | "approved, go to deployment" (merged as `90ae600`; recorded 2026-10-30, ADR-067) |

**Production go-live:** 2026-10-29 (IST, about 02:10), https://zorko-sangli.vercel.app (Vercel `bom1` + production Supabase, Mumbai). Started for R0 on 2026-10-30 with "sure add falvour tags as it is pure veg, and proceedRo".

## Team-requested changes (Phase 7 Round 2, 2026-10-28)

The team asked to keep this project and bring over the UI changes from an unofficial copy (Downloads folder), securely, in rounds verified one at a time:
- **2A:** Next.js 16.4.3 security upgrade, official logo, 1480 px page width, "Staff portal" link, outlet gallery photos (ADR-054…057).
- **2A fixes:** admin login (invalid Supabase key from the copy, admin reset), gallery repair + brand photos, footer logo (ADR-058).
- **2B:** brand redesign of header and footer in the zorko.in style, site-wide (ADR-059). Inserted at the team's request on 2026-10-28.
- **2C:** admin menu quick editing (inline ₹ price, quick flags), table QR cards 1–20 with bulk print and PNG/SVG (ADR-061). Done 2026-10-28; Ice Tea category photo added the same day.
- **2D:** feedback quick highlights stored as an enum array (ADR-062, migration `20261028120000_feedback_tags`, applied to the dev database), full regression. Done 2026-10-28, uncommitted.
- **2E:** final homepage polish (ADR-063): no eyebrow dashes, authentic ZORKO hero photo, lighter icons, Popular Picks photos edge to edge. Done 2026-10-29, uncommitted.
- **2F:** hero refinement (ADR-064): tighter burger crop, 6/6 columns, no hero hours chip, count badge on the frame edge; team's test review deleted from the dev database. Done 2026-10-29, uncommitted.
- **2G:** team-supplied hero burger photo (ADR-065), portrait 4:5 frame. Done 2026-10-29, uncommitted. Open: photo looks non-veg against the "100% VEG" badge; licence unknown.
- **Commits:** only with the team's explicit permission (team instruction, 2026-10-28). 2A is commit `ad65c16`; 2A fixes, 2B and 2C (incl. signed-in admin verification) committed on 2026-10-28 with permission ("yes procedd and commit this").

## Open bugs

None open. Fixed in Phase 6 Round 2: admin stayed signed in across visits (ADR-052).

## Deferred backlog (outside current phase scope)

- Loyalty and Reward Program: future work (synopsis methodology lists it as future expansion). Confirm with guide.
- Online ordering, payment, customer accounts, delivery/order tracking: future work (synopsis + CLAUDE.md 3.0).
- Secret scanning: gitleaks runs via Docker (`ghcr.io/gitleaks/gitleaks`); CI uses gitleaks-action once a GitHub remote exists (Q-16).
- Re-check dev-only advisory `braces` ≤3.0.3 (still no patched release on 2026-10-16); adopt it when published (ADR-032, R-12).
- Team machine: `~/.npm` cache has root-owned files; fix with `sudo chown -R $(whoami) ~/.npm` (ADR-030).
- Visual regression baselines start in Phase 4A.
- CSP keeps `'unsafe-inline'` scripts (R-07, ADR-053); revisit if Next ships a static-compatible strict CSP.
- Remove the `deepmerge-ts` / `mysql2` npm overrides once Prisma ships patched dependencies (ADR-036, review in Phase 7).
- Page-level caching + on-demand revalidation (≤30 s freshness) is designed with the pages in 4A/5B (ADR-035).
- Real menu, prices, address, phone and map are in (ADR-044, ADR-046). Opening hours (Q-05), real offers (Q-07), WhatsApp/email/social (Q-03/Q-04) are still placeholders.
- Visual baselines exist only for macOS (`-darwin`); record Linux baselines when CI is set up (Q-16).
- Structured data (JSON-LD, FR-023) once hours and the remaining café facts are confirmed (ADR-047).
- Gallery lightbox E2E with real uploaded photos once Storage is set up.
- New admin actions: use `expirePublic()` from `action-utils.ts` and return `redirectTo` instead of calling `redirect()` (ADR-050).
- ~~Real Storage uploads NOT RUN in E2E~~ Done 2026-10-28: `SUPABASE_SECRET_KEY` and `public-media` exist; item, banner and gallery uploads PASS.
- `getAdminCheck()` (`src/server/auth/admin.ts`) treats a failed `getUser()` call (Supabase unreachable) as signed out without logging it. Failing closed is correct, but log non-session errors like the login action does (`admin.login_auth_service_error`, status only) so an outage is not mistaken for a logout. Seen in Round 2D E2E on a flaky network.

## Assumptions waiting for team confirmation

Phase 1 approval (2026-10-13) did not comment on A-09…A-11 / Q-19; they are applied as proposed and remain open for objection.

See `docs/PHASE_REPORTS/phase-0.md` → "Synopsis vs CLAUDE.md differences". In short:

1. A-01: Loyalty/Reward program is out of scope for this release.
2. A-02: Admin login uses Supabase Auth (email + password) plus an `AdminUser` allowlist, not a username/password table as in the pseudocode.
3. A-03: Menu "Delete" is soft-archive by default; hard delete only for unreferenced records.
4. A-04: "Frequently Bought Together" = admin-managed item associations; combos are shown separately as offers.
5. A-05: Public "customer reviews" = moderated feedback submitted through the site (no ratings, no imported reviews).
6. A-06: "Customer Gallery" = admin-uploaded gallery photos (no customer photo uploads).
7. A-07 (revised in Phase 1): Homepage shows up to **4** trending/best-seller items to match the design grid (ADR-023; synopsis says 5).
8. A-08: Synopsis copy used: `~/Downloads/MINI PROJECT SYN (2).pdf` (chosen by the team on 2026-10-13).
9. A-09: Primary button hover uses `#d1430a` instead of Stitch `#E64A19` for WCAG AA contrast (ADR-004).
10. A-10: Header fixes to the Stitch design: sticky header, no-wrap nav, drawer at 768–1279 px (ADR-024).
11. A-11: Feedback has no star ratings (ADR-026, Q-11).

Full list of information needed from the café/team: `docs/OPEN_QUESTIONS.md` (Q-01…Q-20).
