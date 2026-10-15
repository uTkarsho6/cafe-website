# DEPLOYMENT

**Version:** 1.0 (Phase 1 skeleton). Commands marked *(Phase N)* become available in that phase; this document is completed and verified step by step through Phase 8.

## 1. Environments

| Env | App | Database / Auth / Storage | Who may change it |
|---|---|---|---|
| Local | `npm run dev` on the team's laptop | Supabase **dev** project (`zorko-sangli-dev`) | Team |
| Preview | Vercel preview deployments | Supabase **dev** project | Team (after Phase 8 setup) |
| Production | Vercel production (`main`) | Supabase **prod** project (`zorko-sangli-prod`) | Only with written team approval (CLAUDE.md rule 14) |

Never point local or preview at the production database.

## 2. Prerequisites

- Node.js 22.x LTS (≥22.13; the dev machine has 22.13.1), npm 11, Git.
- Supabase account with two projects (Mumbai region recommended).
- Vercel account (Phase 8).
- Docker Desktop is optional; it may be used for a local Postgres in CI-like integration tests.

## 3. Environment variables

The full table is in TRD §8.
- Copy `.env.example` → `.env.local` (git-ignored) and fill in the values from the Supabase dashboard.
- **Never paste values into chat, issues or commits.**
- Server-only variables must not start with `NEXT_PUBLIC_`.
- Where to find each value in the Supabase dashboard *(verified against the dashboard in Phase 3)*:
  - **`DATABASE_URL`:** Project → Connect → *Transaction pooler* (port 6543). Append the query parameters required by the Prisma 7 docs (recorded in Phase 3).
  - **`DIRECT_URL`:** Project → Connect → *Direct connection* or *Session pooler* (port 5432).
  - **`NEXT_PUBLIC_SUPABASE_URL`:** the project URL, `https://<project-ref>.supabase.co` (Project Settings → Data API). The app uses only its origin, so the REST URL (`…/rest/v1/`) also works, but prefer the plain project URL.
  - **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`:** Project Settings → API Keys (publishable key, or the legacy anon key).
  - **`SUPABASE_SECRET_KEY`:** Project Settings → API Keys → secret key (or the legacy service_role). Server only, never `NEXT_PUBLIC_`. Needed from Phase 5B for image uploads (Storage writes). Without it the app works, but the item editor shows "Image uploads are switched off".
  - **`RATE_LIMIT_SALT`:** generate with `openssl rand -hex 32`. Required from Phase 5A (admin login rate limiting).
  - **`E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`, `E2E_USER_EMAIL`/`E2E_USER_PASSWORD`:** development only, for the automated admin tests: two dedicated test accounts in the **dev** Supabase project (one becomes an admin in the throwaway test database only, one stays a normal user). Never set these in production.
  - **`NEXT_PUBLIC_SITE_URL`:** `http://localhost:3000` locally; the https production domain in production.

## 4. Local setup *(verified in Phase 2)*

```bash
git clone <repo> && cd zorko-sangli
npm ci
cp .env.example .env.local   # then fill values (Phase 3+ needs Supabase values)
npm run dev                  # http://localhost:3000
curl http://localhost:3000/api/health   # {"status":"ok","db":"ok",…}; 503 + "db":"down" without a database
```

- **Local production build:** `npm run build && npm start`. To see `/dev/styleguide` in a production build, set `ENABLE_STYLEGUIDE=true` for **both** commands: the page re-checks the flag at request time.
- **Safari note:** HSTS and `upgrade-insecure-requests` are sent only when `NEXT_PUBLIC_SITE_URL` is https (ADR-028), so http://localhost works in Safari.
- **If `npm ci` reports "Missing … from lock file" or `EACCES` under `~/.npm`:** your npm cache has files owned by another user. Fix it once with `sudo chown -R $(whoami) ~/.npm` (ADR-030).

## 5. Database setup *(verified in Phase 3 against a local Postgres; run by the team on the dev project)*

**Connection strings** (Supabase dashboard → *Connect*), placed in `.env.local` by the team, never pasted in chat:

| Variable | Which Supabase string | Used by |
|---|---|---|
| `DATABASE_URL` | **Transaction pooler** (port 6543) | the running app (`src/server/db.ts`, pg driver adapter) |
| `DIRECT_URL` | **Direct connection** (port 5432), or the **Session pooler** if your network has no IPv6 | Prisma CLI (migrations) and the seed (`prisma.config.ts`) |

```bash
npm run db:migrate:deploy               # applies prisma/migrations (init + security_rls) to DIRECT_URL
npm run db:migrate:status               # "Database schema is up to date!"
ALLOW_DEMO_SEED=true npm run db:seed    # demo data; refuses without the flag and in production
```
- Use `db:migrate:deploy` for an existing project. `npm run db:migrate:dev` (creates new migrations) is for schema changes during development only.
- The `security_rls` migration enables RLS on every table and revokes `anon`/`authenticated` privileges. Verify with `npm run test:supabase` (needs `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
- **The seed is create-only:** rows whose slug already exists are left unchanged, so re-running is safe. Demo offer dates are relative to the first seed run (active offers expire 30 days later; re-seeding does not refresh existing rows).
- Production: `npm run db:migrate:deploy`, **only with written approval**, after a backup (§9). Never seed production.
- `prisma migrate reset` (destructive) only on the dev project and only with team approval (Prisma also refuses to run it from an AI agent without explicit consent).
- **Replacing demo data with real data:** edit through the admin panel (Phase 5, preferred), or run `npm run db:remove-demo -- --confirm`. It deletes only `isDemo = true` offers, banners, gallery images, feedback, items and categories (items still used by a real offer are kept). Café info and hours are kept: edit them instead.
- **Loading the REAL Sangli menu (ADR-044, recommended):** `npm run db:remove-demo -- --confirm` then `npm run db:import-menu`. Imports 65 items and the outlet's address/phone; keeps the opening hours (still unconfirmed). Safe to re-run (create-only).
- **Switching an existing dev database to the ZORKO-style demo menu (Phase 4B, ADR-043):** `npm run db:remove-demo -- --confirm` then `ALLOW_DEMO_SEED=true npm run db:seed`. Development project only.
- **Placeholder images** live in `public/demo/` (regenerate with `node scripts/make-demo-images.mjs`).

### 5.1 Local test database (automated tests only)
`npm run test:integration` and `npm run test:e2e` start a throwaway Docker container `zorko-test-db` on `127.0.0.1:54329` (`scripts/test-db.sh`), recreate it, apply the migrations and seed it. It mimics Supabase's `anon`/`authenticated` roles. It never touches a Supabase project. Remove it with `npm run test:db:down`. Requires Docker Desktop to be running.

## 6. First-admin provisioning *(Phase 5A)*

1. Supabase dashboard → Authentication → Sign In / Providers → **disable "Allow new users to sign up"**. Keep the Email provider enabled.
2. Authentication → Users → **Add user** → **Create new user**: email + strong password (≥14 characters, from a password manager), tick **Auto Confirm User**. Copy the new user's **User UID**.
3. On the dev machine (uses `DIRECT_URL` from `.env.local`):
   ```bash
   npm run admin:add -- --user-id <User UID> --email <admin email> --name "Display name"
   npm run admin:list            # check: shows the admin as "active"
   ```
   The script only inserts or re-activates an `AdminUser` row and writes an audit entry. It never creates, reads or prints passwords and needs no Supabase secret key.
4. Sign in at `/admin/login`.
5. Optional (Q-14): enable MFA (TOTP) for admins in Supabase.

- **Production:** the same steps against the production project; the script refuses to run with `VERCEL_ENV=production` unless `--production` is added (Phase 8).
- **Disable an admin:** `npm run admin:disable -- --email <email>` (`isActive=false`; the row and its audit history stay). The next admin request is refused, because every page and action checks the allowlist. Optionally also delete or ban the user in Supabase.
- **Recovery:**
  - Forgotten password: reset it in the Supabase dashboard (Users → user → Send password recovery), or set a new one there.
  - Lost all admins: repeat steps 2–3.
- **Sessions:** sign-out revokes that session's refresh token. A signed-out or forged token is rejected at once, because `requireAdmin()` checks the session with the Supabase Auth server (`getUser()`), not just the cookie (ADR-048).

## 7. Storage *(Phase 5B)*

1. Supabase → Storage → **New bucket**: name `public-media`, **Public bucket: on**, file size limit `5 MB`, allowed MIME types `image/webp, image/jpeg, image/png`.
2. Do **not** add any insert/update/delete policy for `anon` or `authenticated`. Only the server writes, using `SUPABASE_SECRET_KEY` after `requireAdmin()` and validation (ADR-049).
3. Put `SUPABASE_SECRET_KEY` in `.env.local` (and later in Vercel, Production only). Restart `npm run dev`.
4. Check: open `/admin/menu`, open an item, and upload a JPEG/PNG/WebP under **Images**. The photo appears on `/menu/<slug>` straight away.
- `next.config.ts` allows images from `<project>.supabase.co/storage/v1/object/public/**` automatically (derived from `NEXT_PUBLIC_SUPABASE_URL`).
- Uploaded files are stored as `items/<itemId>/<uuid>.webp` (re-encoded, metadata stripped). Removing or replacing an image deletes the old file.

## 8. Build, test, deploy *(Phase 2+ / Phase 8)*

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run test:e2e
```
- **Vercel (Phase 8, with approval):**
  - Import the repo and set the env vars for Production and Preview separately.
  - Set the region to `bom1`.
  - The production branch is `main`.
- After deploy:
  - `GET /api/health` returns `{"status":"ok","db":"ok"}`.
  - Open `/qr` and confirm the encoded URL is the https production domain.

## 9. Backups

- Supabase automatic daily backups (plan-dependent; check Project → Database → Backups).
- Before every production migration: `pg_dump "$DIRECT_URL" -Fc -f backup-YYYYMMDD.dump`. Run it locally, store the file privately, and never commit it.

## 10. Rollback

- **App:** Vercel → Deployments → previous deployment → *Promote to Production*.
- **Database:** forward-fix migration. If necessary, restore from backup (`pg_restore`) **only with written approval**.
- **Content mistakes:** use the audit log to identify the change and revert it via the admin.

## 11. Credential rotation

| Secret | How |
|---|---|
| DB password | Supabase → Database → Reset password → update `DATABASE_URL`/`DIRECT_URL` locally and in Vercel → redeploy |
| Secret key | Supabase → API Keys → create new secret key → update `SUPABASE_SECRET_KEY` → redeploy → delete old key |
| Publishable key | Same process (public, but rotate if abused) |
| `RATE_LIMIT_SALT` | Generate new → update env → redeploy (resets current windows) |
| Admin password | Supabase dashboard reset |

If any secret appears in a log, chat, commit or screenshot, treat it as compromised, rotate it immediately, and record it in the phase report.

## 12. Demo / viva checklist

- [ ] Wake the Supabase projects (free tier pauses after inactivity): open the dashboard and call `/api/health`.
- [ ] Confirm demo-data ribbon state (expected or not).
- [ ] Print or test the QR code from `/admin/qr` on a phone.
- [ ] Admin credentials are available in the team's password manager.

## 13. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Env validation failed: DATABASE_URL` | `.env.local` missing or wrong file name |
| Prisma "prepared statement already exists" | Pooled URL missing the pgbouncer parameter (Phase 3 notes) |
| Images not loading | `remotePatterns` host mismatch or bucket not public |
| QR points to localhost | `NEXT_PUBLIC_SITE_URL` not set for that environment |
| Admin login loops | Cookie not set (site URL/domain mismatch), or the user is not in `AdminUser` |
