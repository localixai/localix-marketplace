import { cn } from '@localixai/mini-app-sdk/ui/classes'
import { ProgressBar } from '@localixai/kit/progress-bar'
import { Skeleton } from '@localixai/kit/skeleton'
import { STAGES, TARGETS, type Summary } from '../../shared/model'
import { countOf, formatCompactMoney, formatMonth, formatPercent } from '../format'
import { STAGE_LABEL } from '../stage'

/** Parts of the dashboard pattern: a target row with meaningful tone, the insights, the skeleton. */

type Tone = 'success' | 'warning' | 'error'

/** Colour follows meaning, and always rides beside a number and a word, never alone. */
const TONE: Record<Tone, { text: string; fill: string; word: string }> = {
  success: { text: 'text-status-success', fill: 'bg-status-success', word: 'On target' },
  warning: { text: 'text-status-warning', fill: 'bg-status-warning', word: 'Getting there' },
  error: { text: 'text-status-error', fill: 'bg-status-error', word: 'Behind' },
}

export const toneOf = (ratio: number): Tone =>
  ratio >= 1 ? 'success' : ratio >= 0.5 ? 'warning' : 'error'

export function TargetRow({
  label,
  actual,
  goal,
  format,
}: {
  label: string
  /** `null` when there is nothing to measure yet (no decided deals for a win rate). */
  actual: number | null
  goal: number
  format: (value: number) => string
}) {
  const ratio = actual === null ? 0 : actual / goal
  const tone = TONE[toneOf(ratio)]
  const percent = Math.round(ratio * 100)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-text-soft">{label}</span>
        <span className="tabular-nums text-text-faint">
          {actual === null ? 'No data yet' : `${format(actual)} of ${format(goal)}`}
        </span>
      </div>
      <ProgressBar
        value={Math.min(100, percent)}
        fillClassName={tone.fill}
        className="h-1.5"
        aria-label={`${label}: ${percent}% of target`}
      />
      <p className={cn('text-2xs font-medium tabular-nums', tone.text)}>
        {actual === null ? 'Not measurable yet' : `${percent}% · ${tone.word}`}
      </p>
    </div>
  )
}

export const TARGET_ROWS = (summary: Summary) =>
  [
    {
      label: 'Won this quarter',
      actual: summary.wonThisQuarter,
      goal: TARGETS.wonQuarterUsd,
      format: formatCompactMoney,
    },
    {
      label: 'Open pipeline',
      actual: summary.pipelineValue,
      goal: TARGETS.openPipelineUsd,
      format: formatCompactMoney,
    },
    { label: 'Win rate', actual: summary.winRate, goal: TARGETS.winRate, format: formatPercent },
  ] as const

/**
 * Sentences that explain the numbers: a chart shows the shape, these say what it means. Pure, so
 * the wording is tested without a screen, and every sentence is built from the summary alone.
 */
export function insightsOf(summary: Summary): string[] {
  const insights: string[] = []
  const open = summary.byStage.filter((row) => STAGES.slice(0, 3).includes(row.stage))
  const biggest = [...open].sort((a, b) => b.value - a.value)[0]
  if (biggest && summary.pipelineValue > 0) {
    insights.push(
      `${STAGE_LABEL[biggest.stage]} holds the most open value: ${formatCompactMoney(biggest.value)}, ${formatPercent(biggest.value / summary.pipelineValue)} of the pipeline.`,
    )
  }
  if (summary.winRate === null) {
    insights.push('No deal has been won or lost yet, so there is no win rate to read.')
  } else {
    insights.push(
      `Win rate is ${formatPercent(summary.winRate)}: ${countOf(summary.wonCount, 'deal')} won and ${summary.lostCount} lost.`,
    )
  }
  const { count, value } = summary.closingThisMonth
  insights.push(
    count === 0
      ? 'No open deal is due to close this month.'
      : `${countOf(count, 'open deal')} ${count === 1 ? 'is' : 'are'} due to close this month, worth ${formatCompactMoney(value)}.`,
  )
  const best = [...summary.wonByMonth].sort((a, b) => b.value - a.value)[0]
  if (best && best.value > 0) {
    insights.push(
      `${formatMonth(best.month)} was the best of the last six months: ${formatCompactMoney(best.value)} won.`,
    )
  }
  return insights
}

/** The dashboard's loading state: the same grid, empty. */
export function DashboardSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
        {[0, 1, 2, 3].map((card) => (
          <Skeleton key={card} className="h-[4.25rem] rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-2">
        <Skeleton className="h-52 rounded-lg" />
        <Skeleton className="h-52 rounded-lg" />
      </div>
    </div>
  )
}
