import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Security: user/admin content must be rendered as escaped text (SECURITY.md AB-06).
      'react/no-danger': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // CLI scripts (seed, image generator) report progress on stdout.
    files: ['prisma/**', 'scripts/**'],
    rules: { 'no-console': 'off' },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'design/**',
    // Python notebook environment and outputs (Phase R2): third-party JS inside the venv.
    'notebooks/**',
    'next-env.d.ts',
    'src/generated/**',
    '.claude/**', // Claude Code worktrees: separate checkouts, linted in their own tree
  ]),
])

export default eslintConfig
