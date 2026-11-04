import { BarChart3 } from 'lucide-react'
import { DistributionChart, TrendChart } from '@localixai/mini-app-sdk/ui/stats-charts'
import { Button } from '@localixai/kit/button'
import { Skeleton } from '@localixai/kit/skeleton'
import { Metric, Section } from '../Metric'
import { StateNotice } from '@localixai/kit/state-notice'
import { describeStats } from '../../shared/describe'
import { countOf, formatDay, formatDuration, formatPercent } from '../../shared/format'
import type { Stats } from '../../shared/payloads-more'
import { useRead } from '../data'
import { useReportContext } from '../screen-context'
import { Heat } from '../today/Heat'
import { Hardest } from './Hardest'

/** Answers in the last 30 days needed before a percentage says anything. */
export const ENOUGH_ANSWERS = 10

const STATE_LABEL: Record<keyof Stats['states'], string> = {
  new: 'New',
  learning: 'Learning',
  young: 'Young (under 3 weeks)',
  mature: 'Mature',
  paused: 'Paused',
  hard: 'Hard cards',
  drafts: 'Drafts',
}
/** The Cards-tab state each slice of the distribution opens. */
const STATE_FILTER: Record<keyof Stats['states'], string> = {
  new: 'new',
  learning: 'learning',
  young: 'review',
  mature: 'review',
  paused: 'paused',
  hard: 'hard',
  drafts: 'draft',
}

export function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

/** Numbers about studying: what is coming, what was done, how much was remembered, what is hard. */
export function StatsTab({
  deck,
  onShowCards,
  onOpenCard,
}: {
  deck: string
  onShowCards: (preset: { deck?: string; state?: string }) => void
  onOpenCard: (id: string) => void
}) {
  const stats = useRead('stats', { query: { deckIds: deck === 'all' ? undefined : [deck], days: 30 } })
  // A year of days; the grid draws the weeks that fit.
  const heat = useRead('heatmap', { query: { weeks: 53 } })
  const data = stats.data
  useReportContext(data ? `Stats tab. ${deck === 'all' ? 'All decks.' : `Deck filter ${deck}.`}\n${describeStats(data)}` : null)
  if (!data) {
    return stats.error ? (
      <StateNotice
        role="alert"
        icon={BarChart3}
        title="The numbers could not be loaded"
        body={stats.error}
        actions={<Button onClick={stats.refresh}>Try again</Button>}
      />
    ) : (
      <StatsSkeleton />
    )
  }
  const { retention, time, totals } = data
  const empty = totals.reviews === 0 && totals.notes === 0
  const states = (Object.keys(STATE_LABEL) as (keyof Stats['states'])[])
    .map((key) => ({ key, value: data.states[key] }))
    .filter((row) => row.value > 0)
  // Every answer of the last 30 days counts, new cards included; the backend's own figure covers
  // only cards that were already in review, so it is used when it has enough to go on.
  const last30 = data.perDay.slice(-30)
  const answers = last30.reduce((sum, day) => sum + day.reviews, 0)
  const kept = last30.reduce((sum, day) => sum + day.correct, 0)
  const measured =
    retention.actual !== null && retention.reviews >= ENOUGH_ANSWERS
      ? { ratio: retention.actual, count: retention.reviews }
      : answers >= ENOUGH_ANSWERS
        ? { ratio: kept / answers, count: answers }
        : null
  const reached = measured !== null && measured.ratio >= retention.target
  return (
    <div className="flex flex-col gap-6">
      {empty ? (
        <StateNotice icon={BarChart3} title="Nothing to show yet" body="Study a few cards and the numbers appear here." />
      ) : (
        <>
          <Section title="How it is going">
            <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
              <Metric
                label="Remembered"
                value={measured ? formatPercent(measured.ratio) : '—'}
                hint={
                  measured
                    ? `${reached ? 'on' : 'below'} target ${formatPercent(retention.target)}`
                    : answers === 0
                      ? 'no answers in 30 days'
                      : `${countOf(answers, 'answer')} — too few to tell`
                }
                good={reached}
                title={`${countOf(measured?.count ?? answers, 'answer')} in the last 30 days`}
              />
              <Metric label="Studied today" value={formatDuration(time.todayMs)} />
              <Metric
                label="Last 30 days"
                value={formatDuration(time.last30Ms)}
                hint={time.averageMs === null ? undefined : `${formatDuration(time.averageMs)} a card`}
              />
              <Metric label="Cards" value={totals.notes.toLocaleString('en-US')} hint={`${countOf(totals.reviews, 'answer')} so far`} />
            </div>
          </Section>
          <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-2">
            <Section title="Activity">
              {heat.data ? <Heat heat={heat.data} /> : <Skeleton className="h-24 w-full max-w-xl" />}
              <p className="text-2xs text-text-faint">All decks, newest on the right. A ringed day met the goal.</p>
            </Section>
            <Section title="Due in the next 30 days">
              <TrendChart
                bucketLabel="day"
                points={data.forecast.map((point) => ({
                  key: point.day,
                  value: point.count,
                  detail: `${formatDay(point.day)} · ${countOf(point.count, 'question')} due`,
                }))}
                formatValue={(value) => String(Math.round(value))}
                emptyLabel="Nothing is due in the next 30 days"
              />
            </Section>
            <Section title="Reviews per day, last 90 days">
              <TrendChart
                bucketLabel="day"
                points={data.perDay.map((point) => ({
                  key: point.day,
                  value: point.reviews,
                  detail: `${formatDay(point.day)} · ${countOf(point.reviews, 'review')}, ${point.correct} remembered`,
                }))}
                formatValue={(value) => String(Math.round(value))}
                emptyLabel="No reviews yet"
              />
            </Section>
            <Section title="Where things stand">
              <DistributionChart
                rows={states.map((row) => ({ key: row.key, value: row.value, detail: countOf(row.value, 'question') }))}
                labelKey={(key) => STATE_LABEL[key as keyof Stats['states']]}
                formatValue={(value) => value.toLocaleString('en-US')}
                onSelect={(key) =>
                  onShowCards({ state: STATE_FILTER[key as keyof Stats['states']], deck: deck === 'all' ? undefined : deck })
                }
                emptyLabel="No cards"
              />
              <p className="text-2xs text-text-faint">Counted as questions: a fill-in-the-blank or two-way card asks more than one.</p>
            </Section>
            <Section title="Hardest cards">
              <Hardest rows={data.hardest} onOpen={onOpenCard} onAll={() => onShowCards({ state: 'hard', deck: deck === 'all' ? undefined : deck })} />
            </Section>
          </div>
        </>
      )}
    </div>
  )
}
