import type { Collection, MiniAppContext } from '@localixai/mini-app-sdk/backend'
import { formatMoney } from '../shared/format'
import { CATEGORY_LABEL, expenseInputSchema, summarize, type Expense } from '../shared/model'
import { describeSummary } from '../shared/report'
import type { expensesSpec } from './expenses'

type Expenses = Collection<Expense, (typeof expensesSpec)['input']['shape']>

/**
 * The agent's tools. The report tool is the point of this example: it answers with
 * `describeSummary(summarize(…))`, the same functions the screen's route and insights use, so the
 * agent quotes exactly the numbers the person is looking at.
 *
 * Rules every tool here keeps:
 * - A write is `executionMode: 'sequential'`, `mutates: true`, effect `host` (the app's own data).
 * - `isError: true` only for a call that did nothing because the input was wrong.
 */
export function createTools(ctx: MiniAppContext, expenses: Expenses) {
  const write = {
    executionMode: 'sequential',
    mutates: true,
    classify: () => ({ effect: 'host' as const }),
    permissionPaths: () => [],
  } as const
  const read = { executionMode: 'parallel', mutates: false, permissionPaths: () => [] } as const
  return [
    ctx.defineTool({
      ...write,
      name: 'example_dashboard_add_expense',
      label: 'Record an expense',
      activeVerb: 'Recording',
      description:
        'Record one expense: what it was, its category, the amount in USD and optionally the day (today when left out). Answers with the month so far.',
      // The shared schema with descriptions added: the agent is shown the limits the app keeps.
      inputSchema: expenseInputSchema.extend({
        title: expenseInputSchema.shape.title.describe('What it was, in a few words.'),
        amount: expenseInputSchema.shape.amount.describe('The amount in USD, above 0.'),
        date: expenseInputSchema.shape.date.describe('YYYY-MM-DD. Leave out for today.'),
      }),
      async execute(_toolCallId, input) {
        const expense = await expenses.add(input)
        const report = describeSummary(summarize(await expenses.list(), new Date()))
        return {
          content: `Recorded ${formatMoney(expense.amount)} for "${expense.title}" (${CATEGORY_LABEL[expense.category]}, ${expense.date}).\n${report}`,
        }
      },
    }),
    ctx.defineTool({
      ...read,
      name: 'example_dashboard_report',
      label: 'Report the spending',
      activeVerb: 'Reading the numbers',
      description:
        'The month so far: the total, the last six months, each budget and a few sentences on what the numbers mean. The same figures the dashboard shows.',
      inputSchema: ctx.z.object({}),
      async execute() {
        return { content: describeSummary(summarize(await expenses.list(), new Date())) }
      },
    }),
  ]
}
