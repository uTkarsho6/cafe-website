import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const baseURL = `http://localhost:${PORT}`

/**
 * E2E runs against a production build (`next build && next start`), never the dev server, so
 * headers, caching and error pages behave as in production. ENABLE_STYLEGUIDE exposes the
 * dev-only /dev/styleguide page in that build. The server talks to the local test database, so
 * Docker must be running (`npm run test:e2e` starts and seeds it).
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /admin-(menu|content|feedback|reco)|security/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: /admin-(menu|content|feedback|reco)|security/,
    },
    // Menu and content admin tests change shared test data (prices, availability, new items) and sign in
    // many times, so they run after the read-only suites instead of in parallel with them.
    {
      name: 'admin-menu-chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /admin-menu\.spec\.ts/,
      dependencies: ['chromium', 'webkit'],
    },
    {
      name: 'admin-menu-webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: /admin-menu\.spec\.ts/,
      dependencies: ['admin-menu-chromium'],
    },
    {
      name: 'admin-content-chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /admin-content\.spec\.ts/,
      dependencies: ['admin-menu-webkit'],
    },
    {
      name: 'admin-content-webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: /admin-content\.spec\.ts/,
      dependencies: ['admin-content-chromium'],
    },
    {
      name: 'admin-feedback-chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /admin-feedback\.spec\.ts/,
      dependencies: ['admin-content-webkit'],
    },
    {
      name: 'admin-feedback-webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: /admin-feedback\.spec\.ts/,
      dependencies: ['admin-feedback-chromium'],
    },
    {
      // Phase 7 attack replays (Chromium is enough: they test the server, not the browser).
      name: 'security-chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /security\.spec\.ts/,
      dependencies: ['admin-feedback-webkit'],
    },
    {
      // Phase R5a: recommendation admin changes the switch, versions and tags; runs last.
      name: 'admin-reco-chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /admin-reco\.spec\.ts/,
      dependencies: ['security-chromium'],
    },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      ENABLE_STYLEGUIDE: 'true',
      // The local throwaway test database (scripts/test-db.sh), migrated + seeded by
      // `npm run test:e2e`. Never a Supabase project.
      DATABASE_URL: 'postgresql://zorko_test:zorko_test@127.0.0.1:54329/zorko_test',
      NEXT_PUBLIC_SITE_URL: baseURL,
      // Fixed, non-secret salt for the throwaway test server only (login rate limiting).
      RATE_LIMIT_SALT: 'e2e-test-salt-not-a-secret-0000000000000000',
    },
  },
})
