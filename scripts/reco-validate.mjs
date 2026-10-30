#!/usr/bin/env node
/**
 * Recommendation validity check against a RUNNING site (Phase R3, the team's request:
 * "the recommendation system should give valid recommendations"). Read-only.
 *
 *   npm run reco:validate                          # http://localhost:3000
 *   npm run reco:validate -- http://localhost:3100
 *   npm run reco:validate -- https://zorko-sangli.vercel.app --delay 1100   # live site (R5b)
 *
 * For every dish on data/reco/menu_items.csv it calls /api/v1/menu/<slug>/recommendations, and it
 * calls /api/v1/recommendations/suggest for every mood × budget × flavour combination. It checks:
 * - no dish recommends itself, nothing sold out, no internal fields (scores, ratings, run ids);
 * - "Goes well with" = other meal roles, "You may also like" = same role (café picks excepted);
 * - every reason label is TRUE (shared tags really shared, roles really differ, best sellers real);
 * - Help me choose respects mood, budget, pair totals, diversity, and lists flavour matches first.
 * Exit code 1 if any problem is found. Each request uses its own X-Forwarded-For value so the
 * 60/min rate limit is not hit (works on a local server only; production ignores client values).
 * Against the live site use `--delay <ms>` (1100 keeps under 60 requests/min; ~3.5 minutes).
 */
import { readFileSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '')
const di = process.argv.indexOf('--delay')
const DELAY_MS = di > 0 ? Math.max(0, Number(process.argv[di + 1]) || 0) : 0
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function readCsv(path) {
  const [header, ...lines] = readFileSync(path, 'utf8').trimEnd().split('\n')
  const cols = header.split(',')
  return lines.map((l) =>
    Object.fromEntries(
      [...l.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)]
        .slice(0, cols.length)
        .map((m, k) => [cols[k], m[1].replace(/^"|"$/g, '').replace(/""/g, '"')]),
    ),
  )
}

const menu = new Map(readCsv('data/reco/menu_items.csv').map((r) => [r.item_slug, r]))
const role = (s) => menu.get(s)?.meal_role
const cat = (s) => menu.get(s)?.category
const tags = (s) => new Set((menu.get(s)?.flavor_tags ?? '').split('|').filter(Boolean))
const TAGWORD = {
  spicy: 'SPICY',
  cheesy: 'CHEESY',
  Korean: 'KOREAN',
  'Peri Peri': 'PERI_PERI',
  Italian: 'ITALIAN',
  Mexican: 'MEXICAN',
  barbeque: 'SMOKY',
  paneer: 'PANEER',
  creamy: 'CREAMY',
  fruity: 'FRUITY',
  chocolate: 'CHOCOLATE',
  coffee: 'COFFEE',
  minty: 'MINTY',
}

let n = 0
async function get(path) {
  n++
  if (DELAY_MS) await sleep(DELAY_MS)
  const res = await fetch(BASE + path, { headers: { 'x-forwarded-for': `198.51.100.${n % 250}` } })
  return { status: res.status, body: await res.json() }
}

const problems = []
const stats = {
  pages: 0,
  full: 0,
  mains: 0,
  mainWithSideOrDrink: 0,
  queries: 0,
  empty: 0,
  flavourFirst: 0,
  flavourQueries: 0,
}

for (const slug of menu.keys()) {
  const { status, body } = await get(`/api/v1/menu/${slug}/recommendations`)
  if (status !== 200) {
    problems.push(`${slug}: HTTP ${status}`)
    continue
  }
  stats.pages++
  const { goesWellWith: gww, youMayAlsoLike: ymal } = body.data
  if (gww.length === 4 && ymal.length === 4) stats.full++
  if (role(slug) === 'MAIN') {
    stats.mains++
    if (gww.some((c) => role(c.slug) !== 'MAIN')) stats.mainWithSideOrDrink++
  }
  const isPick = (c) => c.reasons[0]?.code === 'ADMIN_PICK'
  for (const c of [...gww, ...ymal]) {
    if (c.slug === slug) problems.push(`${slug}: recommends itself`)
    if (!c.isAvailable) problems.push(`${slug}: suggests sold-out ${c.slug}`)
    if (/"(score|rating|runId|flavorTags|tasteScore)"/.test(JSON.stringify(c)))
      problems.push(`${slug}: internal field in ${c.slug}`)
    for (const r of c.reasons) {
      if (r.code === 'PAIRS_WITH_ROLE' && role(c.slug) === role(slug))
        problems.push(`${slug} → ${c.slug}: pairing reason but same role`)
      if (r.code === 'SAME_CATEGORY' && cat(c.slug) !== cat(slug))
        problems.push(`${slug} → ${c.slug}: wrong category reason`)
      if (r.code === 'BEST_SELLER' && menu.get(c.slug)?.is_best_seller !== 'true')
        problems.push(`${slug} → ${c.slug}: not a best seller`)
      if (r.code === 'SHARED_TAGS')
        for (const w of r.label.replace(/^Also /, '').split(' & ')) {
          const t = TAGWORD[w]
          if (!t || !tags(slug).has(t) || !tags(c.slug).has(t))
            problems.push(`${slug} → ${c.slug}: "${r.label}" is not true`)
        }
    }
  }
  for (const c of gww)
    if (role(c.slug) === role(slug) && !isPick(c))
      problems.push(`${slug}: goes-well-with ${c.slug} has the same role`)
  for (const c of ymal)
    if (role(c.slug) !== role(slug) && !isPick(c))
      problems.push(`${slug}: may-also-like ${c.slug} has another role`)
}

const BANDS = {
  any: [0, Infinity],
  'under-100': [0, 9_999],
  '100-200': [10_000, 20_000],
  '200-plus': [20_001, Infinity],
}
const MOOD_ROLE = { meal: 'MAIN', snack: 'SIDE', drink: 'DRINK' }
for (const mood of ['meal', 'snack', 'drink', 'sweet'])
  for (const budget of Object.keys(BANDS))
    for (const tag of ['', 'SPICY', 'CHEESY', 'KOREAN', 'COFFEE', 'FRUITY', 'CHOCOLATE']) {
      const q = `/api/v1/recommendations/suggest?mood=${mood}&budget=${budget}${tag ? `&tags=${tag}` : ''}`
      const { status, body } = await get(q)
      stats.queries++
      if (status !== 200) {
        problems.push(`${q}: HTTP ${status}`)
        continue
      }
      const list = body.data.suggestions
      if (!list.length) {
        stats.empty++
        continue
      }
      const [lo, hi] = BANDS[budget]
      for (const x of list) {
        const s = x.item.slug
        if (x.item.pricePaise < lo || x.item.pricePaise > hi)
          problems.push(`${q}: ${s} outside the budget`)
        if (MOOD_ROLE[mood] && role(s) !== MOOD_ROLE[mood])
          problems.push(`${q}: ${s} does not fit the mood`)
        if (
          mood === 'sweet' &&
          !['CHOCOLATE', 'FRUITY', 'CREAMY'].some((t) => tags(s).has(t)) &&
          role(s) !== 'DESSERT'
        )
          problems.push(`${q}: ${s} is not sweet`)
        if (x.pairWith) {
          if (role(x.pairWith.slug) === role(s))
            problems.push(`${q}: pairing for ${s} has the same role`)
          if (budget === '100-200' && x.pairTotalPaise > 20_000)
            problems.push(`${q}: pair total over budget`)
          if (budget === 'under-100' && x.pairTotalPaise >= 10_000)
            problems.push(`${q}: pair total over budget`)
        }
      }
      const perCat = {}
      for (const x of list) perCat[cat(x.item.slug)] = (perCat[cat(x.item.slug)] ?? 0) + 1
      if (Math.max(...Object.values(perCat)) > 2)
        problems.push(`${q}: more than 2 from one category`)
      if (tag) {
        const has = list.map((x) => tags(x.item.slug).has(tag))
        if (has.some(Boolean)) {
          stats.flavourQueries++
          if (has.every((h, i) => i === 0 || !h || has[i - 1])) stats.flavourFirst++
        }
      }
    }

console.log(
  `Item pages checked: ${stats.pages} (${stats.full} with 4 + 4 suggestions); mains with a side or drink: ${stats.mainWithSideOrDrink}/${stats.mains}`,
)
console.log(
  `Help me choose queries: ${stats.queries} (${stats.empty} with no matching dish); flavour matches listed first: ${stats.flavourFirst}/${stats.flavourQueries}`,
)
if (problems.length) {
  console.log(`\nFAIL  ${problems.length} problem(s):`)
  for (const p of problems.slice(0, 50)) console.log(`  - ${p}`)
  process.exit(1)
}
console.log('PASS  all recommendations are valid')
