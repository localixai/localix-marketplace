import { Flame, Play } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { ProgressBar } from '@localixai/kit/progress-bar'
import { countOf } from '../../shared/format'
import type { TodaySummary } from '../../shared/payloads'
import { nextWords } from '../format'

/** "4 due · 10 new · ~12 min": what waits, with the parts that are zero left out. */
export function studySubline(today: Pick<TodaySummary, 'due' | 'minutes'>): string {
  const { due, minutes } = today
  const waiting = due.review + due.learning
  return [waiting > 0 ? `${waiting} due` : '', due.new > 0 ? `${due.new} new` : '', minutes > 0 ? `~${minutes} min` : '']
    .filter(Boolean)
    .join(' · ')
}

/**
 * The one thing Today is for, as a single card: how much waits on the left, the Study button on
 * the right, and under them today's goal with the streak. Narrow, it stacks: number, line, a
 * full-width button, then the goal. When nothing is due the button is disabled and says when the
 * next card comes.
 */
export function Hero({ today, now, onStudy }: { today: TodaySummary; now: number; onStudy: () => void }) {
  const { due, nextDueAt, goal, streak } = today
  const done = due.total === 0
  const share = Math.min(1, goal.done / Math.max(1, goal.target))
  return (
    <section aria-label="Study now" className="recall-hero">
      <div className="flex flex-col gap-4 @lg:flex-row @lg:items-center @lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="recall-kicker">Today</span>
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="recall-hero-number">{due.total}</span>
            <span className="text-sm text-text-soft">{due.total === 1 ? 'card' : 'cards'} to study</span>
          </p>
          {!done && <p className="text-xs text-text-soft tabular-nums">{studySubline(today)}</p>}
        </div>
        {done ? (
          <Button size="xl" disabled className="w-full justify-center @lg:w-auto">
            {nextDueAt ? `All done — ${nextWords(nextDueAt, now)}` : 'All done'}
          </Button>
        ) : (
          <Button size="xl" variant="mono" onClick={onStudy} className="w-full justify-center @lg:w-auto @lg:min-w-40">
            <Play data-icon="inline-start" />
            Study
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-1.5" role="group" aria-label="Daily goal">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-text-soft tabular-nums">
            <span className="font-medium text-foreground">{goal.done}</span> of {goal.target} today
          </span>
          <span className="flex items-center gap-1 text-text-soft tabular-nums">
            <Flame className="size-3" aria-hidden />
            {streak > 0 ? `${countOf(streak, 'day')} in a row` : 'No streak yet'}
          </span>
        </div>
        <ProgressBar value={share * 100} className="h-1.5 w-full" />
      </div>
    </section>
  )
}
