import {
  countOf,
  formatChange,
  formatCompactMoney,
  formatMoney,
  formatMonthLong,
  formatPercent,
  monthOnly,
} from './format'
import { CATEGORY_LABEL, TOTAL_BUDGET, type Summary } from './model'

/**
 * WORDS FOR THE NUMBERS — the sentences and the report built from a `Summary`. They live beside
 * the model, not in the screen, because two readers need the same words: the "What the numbers say"
 * list on screen, and the agent's `example_dashboard_report` tool (and the context the open screen
 * publishes). One function, so what the person reads is what the agent says.
 */

export type Tone = 'success' | 'warning' | 'error'

/**
 * How a spend measures against its budget. Spending is the opposite of a goal: more is worse, so
 * the tone runs the other way from "reached the target". Colour is always shown beside a number and
 * a word (`TONE_WORD`), never alone.
 */
export const toneOf = (ratio: number): Tone =>
  ratio >= 1 ? 'error' : ratio >= 0.8 ? 'warning' : 'success'
export const TONE_WORD: Record<Tone, string> = {
  success: 'Within budget',
  warning: 'Close to the limit',
  error: 'Over budget',
}

/** The budget rows the screen draws and the report lists: the whole month first, then each category. */
export function budgetsOf(summary: Summary) {
  return [
    { label: 'This month', spent: summary.spent, budget: TOTAL_BUDGET },
    ...summary.byCategory.map((row) => ({
      label: CATEGORY_LABEL[row.category],
      spent: row.total,
      budget: row.budget,
    })),
  ]
}

/** Sentences that explain the numbers: a chart shows the shape, these say what it means. */
export function insightsOf(summary: Summary): string[] {
  const month = formatMonthLong(summary.month)
  if (summary.count === 0) return [`Nothing has been spent in ${month} yet.`]
  const insights: string[] = []

  const previous = monthOnly(summary.byMonth.at(-2)?.month ?? summary.month)
  insights.push(
    summary.change === null
      ? `${formatMoney(summary.spent)} spent in ${month}; there is no spending last month to compare with.`
      : `${formatMoney(summary.spent)} spent in ${month}, ${formatChange(summary.change)} against ${previous}.`,
  )

  const top = [...summary.byCategory].sort((a, b) => b.total - a.total)[0]!
  insights.push(
    `${CATEGORY_LABEL[top.category]} is the biggest category: ${formatMoney(top.total)}, ${formatPercent(top.total / summary.spent)} of the month.`,
  )

  const over = summary.byCategory.filter((row) => row.total > row.budget)
  insights.push(
    over.length === 0
      ? 'Every category is within its budget.'
      : over
          .map(
            (row) =>
              `${CATEGORY_LABEL[row.category]} is ${formatMoney(row.total - row.budget)} over its ${formatMoney(row.budget)} budget.`,
          )
          .join(' '),
  )

  insights.push(
    summary.projected > TOTAL_BUDGET
      ? `At this pace the month ends at ${formatMoney(summary.projected)}, ${formatMoney(summary.projected - TOTAL_BUDGET)} over the ${formatMoney(TOTAL_BUDGET)} budget.`
      : `At this pace the month ends at ${formatMoney(summary.projected)}, inside the ${formatMoney(TOTAL_BUDGET)} budget.`,
  )

  if (summary.largest) {
    insights.push(
      `The largest expense is ${summary.largest.title}: ${formatMoney(summary.largest.amount)} (${CATEGORY_LABEL[summary.largest.category]}).`,
    )
  }
  return insights
}

/** What the agent is told: the headline figures, the budgets and the same insights the screen shows. */
export function describeSummary(summary: Summary): string {
  const month = formatMonthLong(summary.month)
  const lines = [
    `Spending in ${month}: ${formatMoney(summary.spent)} across ${countOf(summary.count, 'expense')}.`,
    `Last six months: ${summary.byMonth.map((point) => `${point.month} ${formatCompactMoney(point.total)}`).join(', ')}.`,
    'Against budget:',
    ...budgetsOf(summary).map(
      (row) =>
        `- ${row.label}: ${formatMoney(row.spent)} of ${formatMoney(row.budget)} (${formatPercent(row.spent / row.budget)}, ${TONE_WORD[toneOf(row.spent / row.budget)].toLowerCase()})`,
    ),
    'What the numbers say:',
    ...insightsOf(summary).map((sentence) => `- ${sentence}`),
  ]
  return lines.join('\n')
}
