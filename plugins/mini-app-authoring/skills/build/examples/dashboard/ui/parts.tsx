import { cn } from '@localixai/mini-app-sdk/ui/classes'
import { ProgressBar } from '@localixai/kit/progress-bar'
import { Skeleton } from '@localixai/kit/skeleton'
import { formatMoney, formatPercent } from '../shared/format'
import { TONE_WORD, toneOf, type Tone } from '../shared/report'

/** Parts of the dashboard screen: a budget row with meaningful tone, and the loading state. */

/** The host's status tokens per tone: text for the word, background for the bar's fill. */
const TONE_CLASS: Record<Tone, { text: string; fill: string }> = {
  success: { text: 'text-status-success', fill: 'bg-status-success' },
  warning: { text: 'text-status-warning', fill: 'bg-status-warning' },
  error: { text: 'text-status-error', fill: 'bg-status-error' },
}

/**
 * One budget: a label, "$420 of $600", a bar and the verdict. Colour follows meaning (`toneOf`) and
 * always rides beside a number and a word, so it is never the only signal. The bar is capped at
 * 100 while the number keeps saying how far over it is.
 */
export function BudgetRow({
  label,
  spent,
  budget,
}: {
  label: string
  spent: number
  budget: number
}) {
  const ratio = spent / budget
  const tone = toneOf(ratio)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-text-soft">{label}</span>
        <span className="tabular-nums text-text-faint">
          {formatMoney(spent)} of {formatMoney(budget)}
        </span>
      </div>
      <ProgressBar
        value={Math.min(100, Math.round(ratio * 100))}
        fillClassName={TONE_CLASS[tone].fill}
        className="h-1.5"
        aria-label={`${label}: ${formatPercent(ratio)} of budget`}
      />
      <p className={cn('text-2xs font-medium tabular-nums', TONE_CLASS[tone].text)}>
        {formatPercent(ratio)} · {TONE_WORD[tone]}
      </p>
    </div>
  )
}

/** Loading shaped like the dashboard it stands for, so nothing jumps when the numbers arrive. */
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
