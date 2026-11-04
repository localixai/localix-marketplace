import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { useAgentContext, useScreenProblem, type ScreenProps } from '@localixai/mini-app-sdk/ui/app'
import { ProblemLine } from '@localixai/mini-app-sdk/ui/components'
import { usePolledSnapshot } from '@localixai/mini-app-sdk/ui/route-snapshot'
import { DistributionChart, TrendChart } from '@localixai/mini-app-sdk/ui/stats-charts'
import { Button } from '@localixai/kit/button'
import { DIVIDED_LIST } from '@localixai/kit/divided-list'
import { PanelHeader } from '@localixai/kit/panel-header'
import { RefreshAction } from '@localixai/kit/refresh-action'
import { SectionLabel } from '@localixai/kit/section-label'
import { StatCard, StatSection } from '@localixai/kit/stat'
import { StateNotice } from '@localixai/kit/state-notice'
import {
  countOf,
  formatChange,
  formatCompactMoney,
  formatMoney,
  formatMonth,
  formatMonthLong,
} from '../shared/format'
import { APP, CATEGORY_LABEL, TOTAL_BUDGET, summarySchema, type Category } from '../shared/model'
import { budgetsOf, describeSummary, insightsOf } from '../shared/report'
import { BudgetRow, DashboardSkeleton } from './parts'

/**
 * The screen: one derived route, read with `usePolledSnapshot`. It polls while the screen is
 * visible and keeps the last good answer if a poll fails. A derived route is not a collection, so
 * nothing pokes it: the interval is how an expense the agent adds shows up, and the refresh button
 * covers the wait.
 *
 * Layout follows the PANE, not the window: `@container` on the root, then `@3xl` / `@4xl` queries
 * choose two or four cards and one or two chart columns. The body fills the pane; there is no
 * centred column.
 */
export function App({ active, publishMessageContext }: ScreenProps) {
  const summary = usePolledSnapshot({
    path: `/rpc/${APP}/summary`,
    schema: summarySchema,
    intervalMs: 15_000,
    active,
    failureMessage: 'Cannot read the spending summary.',
  })
  const data = summary.snapshot
  const problem = useScreenProblem({
    app: APP,
    subject: 'Spending',
    failure: summary.error,
    showingData: data !== null,
  })
  // The agent is told what the screen shows, in the words the report tool uses.
  useAgentContext(
    publishMessageContext,
    active && data !== null,
    useMemo(
      () => (data ? { label: 'Spending', content: describeSummary(data) } : null),
      [data],
    ),
  )
  // Nothing recorded in the whole window: charts of zeros say nothing, so say what to do.
  const nothingYet = data !== null && data.byMonth.every((point) => point.count === 0)

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <PanelHeader
        tone="content"
        title="Spending"
        summary={
          data
            ? `${formatMonthLong(data.month)} · ${formatMoney(data.spent)} of ${formatMoney(TOTAL_BUDGET)}`
            : 'Loading…'
        }
        actionsLabel="Spending actions"
        actions={
          <RefreshAction
            aria-label="Refresh the numbers"
            tooltip="Refresh"
            onClick={summary.refresh}
          />
        }
      />
      {problem && <ProblemLine {...problem} />}
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
        ) : nothingYet ? (
          <StateNotice
            icon={BarChart3}
            title="No spending yet"
            body="Ask in the chat: “I spent $42 on groceries today”. The numbers appear here."
          />
        ) : (
          <div className="flex flex-col gap-6">
            <StatSection title="This month">
              <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
                <StatCard
                  label="Spent"
                  value={formatCompactMoney(data.spent)}
                  hint={countOf(data.count, 'expense')}
                  title={formatMoney(data.spent)}
                />
                <StatCard
                  label="Against last month"
                  value={formatChange(data.change)}
                  // Spending down is good: the hint is the only place tone appears on a card.
                  hint={data.change !== null && data.change <= 0 ? 'less than before' : undefined}
                  hintTone="good"
                />
                <StatCard
                  label="On pace for"
                  value={formatCompactMoney(data.projected)}
                  title={formatMoney(data.projected)}
                  hint={`budget ${formatCompactMoney(TOTAL_BUDGET)}`}
                />
                <StatCard
                  label="Largest"
                  value={data.largest ? formatCompactMoney(data.largest.amount) : '—'}
                  hint={data.largest?.title}
                />
              </div>
            </StatSection>
            <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2">
              <StatSection title="By category">
                <DistributionChart
                  rows={data.byCategory.map((row) => ({
                    key: row.category,
                    value: row.total,
                    detail: countOf(row.count, 'expense'),
                  }))}
                  labelKey={(key) => CATEGORY_LABEL[key as Category]}
                  formatValue={formatCompactMoney}
                  emptyLabel="Nothing spent this month"
                />
              </StatSection>
              <StatSection title="Spent per month">
                <TrendChart
                  // Months, not days: without `bucketLabel` the caption would read "/day".
                  bucketLabel="month"
                  points={data.byMonth.map((point) => ({
                    key: point.month,
                    value: point.total,
                    detail: `${formatMonth(point.month)} · ${countOf(point.count, 'expense')}`,
                  }))}
                  formatValue={formatCompactMoney}
                  emptyLabel="Nothing spent yet"
                />
              </StatSection>
            </div>
            <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2">
              <StatSection title="Budgets">
                <div className="flex flex-col gap-4">
                  {budgetsOf(data).map((row) => (
                    <BudgetRow key={row.label} {...row} />
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
