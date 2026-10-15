# Phase 6 — QR, feedback and supporting features

**Status:** AWAITING TEAM VERIFICATION · Branch `phase-6` · 2026-10-16

## Requirements addressed
- FR-018 QR menu
- FR-019 feedback submission
- FR-020 public reviews
- FR-044 feedback moderation
- FR-049 admin QR
- FR-045 audit (now complete)
- NFR-005 privacy (90-day retention)

Contact/social links, map and gallery behaviour were already built and tested in 4B and 5C. Their tests ran again here.

## What was built
- **`/qr`**
  - A QR code for `NEXT_PUBLIC_SITE_URL/menu?src=qr`, made on the server with `qrcode` 1.5.4.
  - PNG and SVG downloads, and an "Open the menu" button.
  - The address it points to is shown as text under the code.
- **`/admin/qr`**: the same code, plus a warning when the site address is localhost, a home-network (LAN) address, or plain http.
- **`/feedback`**
  - Optional name (up to 40 characters) and a message (10–1000 characters) with a counter. The privacy note says no email or phone is collected.
  - Abuse protection: a hidden honeypot field, and a limit of 3 submissions per 10 minutes per IP.
  - Shows a success message, field errors, and a "too many submissions" message.
  - New feedback is always stored as pending.
- **`/admin/feedback`**
  - Pending, approved and rejected tabs, with counts and pagination.
  - Approve and reject take one click. Delete asks for confirmation first.
  - Each action is audited without storing the guest's text.
  - Approved feedback appears on the home and contact pages at once.
  - Rejected feedback is deleted automatically after 90 days.
- **Navigation**
  - Public footer and mobile "More" menu: Feedback and QR Menu are live.
  - Admin sidebar: Feedback and QR code are live.
  - The home page now shows its "QR Digital Menu" tiles, and the contact page shows its "Share feedback" link.

## Decisions
ADR-051. In short:
- Feedback is sent through a Server Action rather than a separate API route. It is POST-only and checked against the site's own address (CSRF protection).
- The QR code always uses the configured site address, never the address of the current request.
- Invisible and text-reversing characters are removed from feedback.
- Old rejected feedback is purged when an admin opens the feedback page, so no scheduler is needed.

## Commands run and results
| Check | Result |
|---|---|
| `npm run check` (lint, typecheck, format, unit, build) | PASS: 294 unit/component tests |
| `npm run test:integration` | PASS: 103 (4 new in `feedback.test.ts`) |
| `npm run test:e2e -- --workers=2`, all projects | 270 passed, 24 skipped. The Phase 6 screenshot test failed once, because I added the retention sentence after recording that baseline. I reviewed the difference, re-recorded it, and re-ran the Phase 6 suite in both browsers: PASS, 17 passed, 1 skipped. The 9 WebKit tests that were held back by that failure are included in those 17. |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Visual baselines | **New:** feedback moderation, feedback form, QR page (desktop and mobile). **Re-recorded on purpose:** 14 public baselines (footer links; the home page's QR tiles). Each difference was reviewed. |
| axe accessibility check (serious/critical) on `/feedback`, `/qr`, `/admin/feedback`, `/admin/qr` | PASS: 0 violations |
| No sideways scroll at 375 / 768 / 1440 px | PASS |

**Skipped by design:**
- Screenshot tests run in Chromium only.
- The real Storage upload tests are NOT RUN: Storage isn't configured yet (from 5B/5C).

**Phone scan: PASS (team, 2026-10-16).** The team built with `NEXT_PUBLIC_SITE_URL=http://<LAN IP>:3000`, opened `/qr` on the laptop and scanned it with a phone on the same Wi-Fi. The menu opened on the phone without login. Steps are in DEPLOYMENT.md §7a.

## Security checks
- **XSS:** the payload `<img src=x onerror=…>` was submitted, approved and shown on the home page. It appeared as plain text and never ran (`window.__xss` stayed undefined; no `<img src="x">` element was created).
- **Authorization:** both moderation actions require an admin (unit tests). A forged status or ID is refused.
- **Mass assignment:** a submitted `status=APPROVED` is ignored; feedback is stored as pending.
- **Errors:** a database failure shows a generic message with no internal details.
- **Audit log:** contains no guest text.

## HOW TO TEST THIS PHASE
1. Switch to the branch and start the app:
   ```bash
   git switch phase-6
   npm ci
   npm run dev
   ```
2. **Feedback:**
   - Open http://localhost:3000/feedback and send a message. You should see "Thanks!".
   - Sign in, open **Admin → Feedback** and click **Approve**. The message appears under reviews on the home and contact pages.
   - Click **Reject**: it disappears from those pages.
   - Send 4 messages within 10 minutes: the 4th is refused.
3. **QR on a phone** (same Wi-Fi as the laptop):
   - Run `ipconfig getifaddr en0` to get the laptop's address.
   - Build and start with that address (only for this test; nothing to commit):
     ```bash
     NEXT_PUBLIC_SITE_URL=http://<that-ip>:3000 npm run build
     NEXT_PUBLIC_SITE_URL=http://<that-ip>:3000 npx next start -H 0.0.0.0 -p 3000
     ```
   - On the laptop, open `http://<that-ip>:3000/qr`.
   - Scan it with the phone camera: the menu should open with no login.
4. **Admin QR:** open **Admin → QR code**. Locally it warns that localhost can't be printed. That warning is correct.
5. **Automated checks:**
   ```bash
   npm run check && npm run test:integration && npm run test:e2e -- --workers=2
   ```

**Not bugs:**
- The QR code shows `localhost` in local development.
- Feedback does not appear publicly until it is approved.
- Image uploads stay off until Storage is set up (DEPLOYMENT.md §7).

**If something fails:** send the command output, a screenshot, and any browser console error.

## Round 2 (2026-10-16)

**Team report:** "I visited the admin panel but it didn't ask me to sign in; the previous login was still there."

**Cause:** the Supabase auth cookies lasted 400 days, and the refresh token kept the session alive for weeks.

**Fix (ADR-052):**
- **Cookies end with the browser.** All admin cookies are now browser-session cookies, so closing the browser signs the admin out.
- **Idle and maximum time.** A signed activity cookie, bound to the Supabase session, ends the session after **30 minutes without activity** or **12 hours** after sign-in. This holds even if the browser restores old tabs.
- **What the admin sees.** The session is signed out on the server and the login page says "Your session expired. Please sign in again."
- **Second check.** `requireAdmin()` checks the cookie again, so the proxy is never the only check.

**Regression tests:**
- `tests/unit/admin-activity.test.ts` (6 tests): idle, maximum, tampered, foreign-session, wrong-key and future-dated cookies, plus session-only cookie options.
- A new E2E test in `tests/e2e/admin.spec.ts`, run twice in Chromium and WebKit:
  - the cookies have no expiry date;
  - a tampered timestamp ends the session and clears the Supabase cookies;
  - a missing activity cookie ends the session.

**Re-run of all checks:**

| Check | Result |
|---|---|
| `npm run check` | PASS: 300 unit/component tests, build OK |
| `npm run test:integration` | PASS: 103 |
| `npm run test:e2e -- --workers=2` (all projects, both engines) | PASS: 281 passed, 0 failed, 25 skipped (Chromium-only baselines in WebKit; Storage uploads NOT RUN) |

**How to check it yourself:**
1. Sign in at `/admin`.
2. Quit the browser completely (Cmd+Q), reopen it and go to `/admin`. It asks you to sign in.
3. Or sign in, leave the tab for more than 30 minutes, then click anything. You are sent to the login page with "Your session expired".

Phase 6 complete. Waiting for your approval or bug reports before starting Phase 7. To approve, reply exactly: approved, go to Phase 7
