import { z } from 'zod'

/**
 * Zod 4 normally probes `new Function()` to compile fast parsers. Our CSP forbids eval
 * (`script-src` has no 'unsafe-eval' in production), so in the browser that probe was reported as
 * a CSP violation on every page with a form (found by Lighthouse in Phase 7). Jitless mode skips
 * the probe; the cost is negligible for forms this size. Imported first by every validation module.
 */
z.config({ jitless: true })
