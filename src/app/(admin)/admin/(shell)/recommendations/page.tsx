import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { PillLink, PillRow } from '@/components/ui/chip'
import { Skeleton } from '@/components/ui/skeleton'
import { idSchema } from '@/lib/validation/admin-menu'
import { formatDateIST } from '@/lib/format'
import {
  ActivateRunButton,
  RecoEnabledSwitch,
  RetrainButton,
  WeightsForm,
} from '@/features/admin/reco/reco-controls'
import { requireAdmin } from '@/server/auth/admin'
import {
  getRecoOverview,
  inspectItem,
  listInspectableItems,
  type InspectRow,
  type RecoRunRow,
} from '@/server/services/admin-reco'

export const metadata: Metadata = { title: 'Recommendations' }

const TABS = [
  ['overview', 'Overview'],
  ['runs', 'Versions'],
  ['inspect', 'Inspect a dish'],
] as const
type Tab = (typeof TABS)[number][0]

/**
 * Admin recommendations (FR-067, UI_SPEC §13, Phase R5). Tabs are links (`?tab=`), so each view
 * has a URL and works with the back button. Every action is a Server Action with its own
 * `requireAdmin()`; this page only reads.
 */
export default function AdminRecommendationsPage({
  searchParams,
}: PageProps<'/admin/recommendations'>) {
  return (
    <div className="flex flex-col gap-space-xl">
      <header>
        <h1 className="text-headline-lg-mobile md:text-headline-lg">Recommendations</h1>
        <p className="text-body-md text-on-surface-variant">
          “Goes well with”, “You may also like” and Help me choose. Trained on demo feedback
          (RECOMMENDATION.md); scores below are visible to admins only.
        </p>
      </header>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)} %`)
const num = (v: number | null) => (v === null ? '—' : v.toFixed(3))

async function Content({
  searchParams,
}: Pick<PageProps<'/admin/recommendations'>, 'searchParams'>) {
  await connection()
  await requireAdmin('/admin/recommendations')
  const sp = await searchParams
  const tab: Tab = TABS.some(([t]) => t === sp.tab) ? (sp.tab as Tab) : 'overview'
  const overview = await getRecoOverview()

  return (
    <>
      <nav aria-label="Recommendation views">
        <PillRow>
          {TABS.map(([key, label]) => (
            <PillLink
              key={key}
              href={`/admin/recommendations?tab=${key}`}
              active={tab === key}
              scroll={false}
            >
              {label}
            </PillLink>
          ))}
        </PillRow>
      </nav>
      {tab === 'overview' && <Overview overview={overview} />}
      {tab === 'runs' && <Runs runs={overview.runs} />}
      {tab === 'inspect' && <Inspect item={typeof sp.item === 'string' ? sp.item : undefined} />}
    </>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-container-lowest p-space-md shadow-sm">
      <p className="text-label-md text-on-surface-variant">{label}</p>
      <p className="font-heading text-headline-md text-on-surface">{value}</p>
    </div>
  )
}

function Overview({ overview: o }: { overview: Awaited<ReturnType<typeof getRecoOverview>> }) {
  const a = o.active
  return (
    <div className="flex flex-col gap-space-lg">
      <section aria-label="Summary" className="grid grid-cols-2 gap-space-sm lg:grid-cols-5">
        <Card label="Active version" value={a ? `v${a.version}` : 'None'} />
        <Card label="Trained" value={a?.trainedAt ? formatDateIST(a.trainedAt) : '—'} />
        <Card label="Data source" value={`Demo feedback (${o.demoRatingCount} ratings)`} />
        <Card label="HitRate@5 goes well with" value={num(a?.hitRate5Complement ?? null)} />
        <Card label="RMSE" value={num(a?.rmse ?? null)} />
      </section>
      <section
        aria-labelledby="reco-controls"
        className="flex flex-col gap-space-md rounded-3xl bg-surface-container-lowest p-space-lg shadow-sm"
      >
        <h2 id="reco-controls" className="text-headline-sm">
          Website and training
        </h2>
        <RecoEnabledSwitch enabled={o.enabled} />
        <p className="text-body-sm text-on-surface-variant">
          Off: item pages show only your café picks (linked items). Help me choose keeps working.
          Sold-out dishes are never suggested.
        </p>
        <div className="flex flex-wrap items-center gap-space-sm">
          <RetrainButton training={o.training} />
          <span className="text-body-sm text-on-surface-variant">
            A new version is activated only if it is not clearly worse than the current one. Menu
            changes (new dishes, tags, meal roles) retrain automatically.
          </span>
        </div>
      </section>
      <section
        aria-labelledby="reco-weights"
        className="flex flex-col gap-space-md rounded-3xl bg-surface-container-lowest p-space-lg shadow-sm"
      >
        <h2 id="reco-weights" className="text-headline-sm">
          Weights
        </h2>
        <WeightsForm weights={o.weights} />
      </section>
    </div>
  )
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-tertiary-container text-on-tertiary-container',
  ARCHIVED: 'bg-surface-container-high text-on-surface-variant',
  REJECTED: 'bg-secondary-container text-on-secondary-container',
  FAILED: 'bg-error-container text-on-error-container',
  TRAINING: 'bg-primary-fixed text-on-primary-fixed',
}

function Runs({ runs }: { runs: RecoRunRow[] }) {
  if (runs.length === 0)
    return (
      <p className="text-body-md text-on-surface-variant">No versions yet. Use “Retrain now”.</p>
    )
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="Versions table"
      className="relative overflow-x-auto rounded-2xl bg-surface-container-lowest shadow-sm focus-visible:outline-2 focus-visible:outline-primary"
    >
      <table className="w-full min-w-[56rem] text-left text-body-sm">
        <thead className="bg-surface-container-low text-label-md text-on-surface-variant uppercase">
          <tr>
            {[
              'Version',
              'Status',
              'Trained',
              'RMSE',
              'HitRate@5 (pair / similar)',
              'Coverage',
              'Gate',
              'Started by',
              '',
            ].map((h) => (
              <th key={h} scope="col" className="px-space-md py-space-sm">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-t border-outline-variant/40">
              <td className="px-space-md py-space-sm font-semibold">v{r.version}</td>
              <td className="px-space-md py-space-sm">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-label-sm ${STATUS_STYLE[r.status] ?? ''}`}
                >
                  {r.status.toLowerCase()}
                </span>
              </td>
              <td className="px-space-md py-space-sm">
                {r.trainedAt ? formatDateIST(r.trainedAt) : '—'}
              </td>
              <td className="px-space-md py-space-sm">{num(r.rmse)}</td>
              <td className="px-space-md py-space-sm">
                {num(r.hitRate5Complement)} / {num(r.hitRate5Similar)}
              </td>
              <td className="px-space-md py-space-sm">{pct(r.coverage)}</td>
              <td className="max-w-64 px-space-md py-space-sm">{r.gateReason ?? 'Passed'}</td>
              <td className="px-space-md py-space-sm">{r.startedBy}</td>
              <td className="px-space-md py-space-sm">
                {r.status === 'ARCHIVED' && <ActivateRunButton runId={r.id} version={r.version} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

async function Inspect({ item }: { item?: string }) {
  const items = await listInspectableItems()
  const id = idSchema.safeParse(item)
  const lists = id.success ? await inspectItem(id.data) : null
  return (
    <div className="flex flex-col gap-space-lg">
      {/* Plain GET form: picking a dish changes the URL (?tab=inspect&item=…). */}
      <form action="/admin/recommendations" className="flex flex-wrap items-end gap-space-sm">
        <input type="hidden" name="tab" value="inspect" />
        <label className="flex flex-col gap-1.5 text-label-md">
          Dish
          <select
            name="item"
            defaultValue={id.success ? id.data : ''}
            className="h-12 min-w-64 rounded-xl border border-[rgba(26,26,26,0.12)] bg-surface-canvas-subtle px-space-md text-body-md"
          >
            <option value="">Choose a dish…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="min-h-12 rounded-full border border-border bg-surface-container-lowest px-space-md text-label-md text-primary"
        >
          Show lists
        </button>
      </form>
      {id.success && !lists && (
        <p className="text-body-md text-on-surface-variant">No active version yet.</p>
      )}
      {lists && (
        <>
          <InspectTable title="Goes well with" rows={lists.complement} />
          <InspectTable title="You may also like" rows={lists.similar} />
          <p className="text-body-sm text-on-surface-variant">
            Customers see the first 4 rows that are not hidden, after your café picks.{' '}
            <Link href="/admin/menu" className="text-primary underline">
              Edit café picks in Menu items
            </Link>
            .
          </p>
        </>
      )}
    </div>
  )
}

function InspectTable({ title, rows }: { title: string; rows: InspectRow[] }) {
  return (
    <section aria-label={title} className="flex flex-col gap-space-sm">
      <h2 className="text-headline-sm">{title}</h2>
      <div
        tabIndex={0}
        role="region"
        aria-label={`${title} table`}
        className="relative overflow-x-auto rounded-2xl bg-surface-container-lowest shadow-sm focus-visible:outline-2 focus-visible:outline-primary"
      >
        <table className="w-full min-w-[52rem] text-left text-body-sm">
          <thead className="bg-surface-container-low text-label-md text-on-surface-variant uppercase">
            <tr>
              {[
                '#',
                'Dish',
                'Score',
                'Content',
                'Taste',
                'Co-occ.',
                'Quality',
                'Reasons',
                'Shown',
              ].map((h) => (
                <th key={h} scope="col" className="px-space-md py-space-sm">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rank} className="border-t border-outline-variant/40">
                <td className="px-space-md py-space-sm">{r.rank}</td>
                <td className="px-space-md py-space-sm font-semibold">{r.name}</td>
                <td className="px-space-md py-space-sm">{r.score.toFixed(3)}</td>
                <td className="px-space-md py-space-sm">{r.contentScore.toFixed(3)}</td>
                <td className="px-space-md py-space-sm">{r.tasteScore.toFixed(3)}</td>
                <td className="px-space-md py-space-sm">{r.coocScore.toFixed(3)}</td>
                <td className="px-space-md py-space-sm">{r.qualityScore.toFixed(3)}</td>
                <td className="px-space-md py-space-sm">{r.reasons.join(', ').toLowerCase()}</td>
                <td className="px-space-md py-space-sm">{r.hiddenBecause ?? 'Yes'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
