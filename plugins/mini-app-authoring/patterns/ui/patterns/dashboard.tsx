import { BarChart3 } from 'lucide-react'
import { usePolledSnapshot } from '@localixai/mini-app-sdk/ui/route-snapshot'
import { DistributionChart, TrendChart } from '@localixai/mini-app-sdk/ui/stats-charts'
import { Button } from '@localixai/kit/button'
import { DIVIDED_LIST } from '@localixai/kit/divided-list'
import { PanelHeader } from '@localixai/kit/panel-header'
import { RefreshAction } from '@localixai/kit/refresh-action'
import { SectionLabel } from '@localixai/kit/section-label'
import { StatCard, StatSection } from '@localixai/kit/stat'
import { StateNotice } from '@localixai/kit/state-notice'
import { APP, summarySchema, type Stage } from '../../shared/model'
import type { PatternProps } from '../data'
import { countOf, formatCompactMoney, formatMoney, formatMonth, formatPercent } from '../format'
import { STAGE_LABEL } from '../stage'
import { DashboardSkeleton, TARGET_ROWS, TargetRow, insightsOf } from './dashboard-parts'

/**
 * DASHBOARD — the numbers that answer "how are we doing": KPI cards, a distribution, a trend,
 * progress against targets, and a few sentences that say what the numbers mean.
 *
 * It reads one derived route (`/summary`), computed on the server by the same `summarize` the
 * tests pin, instead of recomputing from every row in the browser. `usePolledSnapshot` polls it
 * while the screen is visible and keeps the last good answer if a poll fails. Layout follows the
 * pane through container queries: two KPI columns, then four; one chart column, then two.
 *
 * Rules worth copying: every figure is formatted (never `84000`); a chart value that is money says
 * its currency; colour on a target (`text-status-*`) always sits beside a number and a word; and
 * `TrendChart` is given `bucketLabel="month"` for monthly points, because its caption otherwise
 * says "/day".
 *
 * When copying, rename: `Dashboard`, the route path and `summarySchema`, the cards, the chart
 * rows, `TARGET_ROWS` and `insightsOf` in `dashboard-parts.tsx`.
 */

export function Dashboard({ active }: PatternProps) {
  const summary = usePolledSnapshot({
    path: `/rpc/${APP}/summary`,
    schema: summarySchema,
    intervalMs: 15_000,
    active,
    failureMessage: 'Cannot read the pipeline summary.',
  })
  const data = summary.snapshot

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <PanelHeader
        tone="content"
        title="Pipeline overview"
        summary="Every amount is converted to USD at demo rates"
        actionsLabel="Dashboard actions"
        actions={
          <RefreshAction
            aria-label="Refresh the numbers"
            tooltip="Refresh"
            onClick={summary.refresh}
          />
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 scrollbar-thin @3xl:px-4">
        {!data && summary.loading ? (
          <DashboardSkeleton />
        ) : !data ? (
          <StateNotice
            role="alert"
            icon={BarChart3}
            title="The numbers are not available"
            body={summary.error ?? 'Try again in a moment.'}
            actions={<Button onClick={summary.refresh}>Try again</Button>}
          />
        ) : (
          <div className="flex flex-col gap-6">
            <StatSection title="At a glance">
              <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
                <StatCard
                  label="Pipeline value"
                  value={formatCompactMoney(data.pipelineValue)}
                  hint={countOf(data.openCount, 'open deal')}
                  title={formatMoney(data.pipelineValue)}
                />
                <StatCard
                  label="Win rate"
                  value={formatPercent(data.winRate)}
                  hint={`${data.wonCount} won · ${data.lostCount} lost`}
                  hintTone={data.winRate !== null && data.winRate >= 0.4 ? 'good' : 'muted'}
                />
                <StatCard
                  label="Average deal"
                  value={formatCompactMoney(data.averageDeal)}
                  title={formatMoney(data.averageDeal)}
                />
                <StatCard
                  label="Closing this month"
                  value={data.closingThisMonth.count}
                  hint={formatCompactMoney(data.closingThisMonth.value)}
                />
              </div>
            </StatSection>
            <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2">
              <StatSection title="Value by stage">
                <DistributionChart
                  rows={data.byStage.map((row) => ({
                    key: row.stage,
                    value: row.value,
                    detail: countOf(row.count, 'deal'),
                  }))}
                  labelKey={(key) => STAGE_LABEL[key as Stage]}
                  formatValue={formatCompactMoney}
                  emptyLabel="No deals yet"
                />
              </StatSection>
              <StatSection title="Won value by month">
                <TrendChart
                  // Months, not days: without `bucketLabel` the caption would read "/day".
                  bucketLabel="month"
                  points={data.wonByMonth.map((point) => ({
                    key: point.month,
                    value: point.value,
                    detail: `${formatMonth(point.month)} · ${countOf(point.count, 'deal')} won`,
                  }))}
                  formatValue={formatCompactMoney}
                  emptyLabel="Nothing won yet"
                />
              </StatSection>
            </div>
            <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2">
              <StatSection title="Targets">
                <div className="flex flex-col gap-4">
                  {TARGET_ROWS(data).map((row) => (
                    <TargetRow key={row.label} {...row} />
                  ))}
                </div>
              </StatSection>
              <section aria-labelledby="insights-title" className="flex flex-col gap-2">
                <SectionLabel as="h3" className="px-0.5">
                  <span id="insights-title">What the numbers say</span>
                </SectionLabel>
                <ul className={DIVIDED_LIST}>
                  {insightsOf(data).map((sentence) => (
                    <li key={sentence} className="py-2 text-xs text-text-soft">
                      {sentence}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
