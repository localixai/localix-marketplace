import { z } from 'zod'

/**
 * THE MODEL — what the dashboard keeps and every number it derives. A dashboard is a collection
 * (the rows people and the agent add) plus ONE pure function, `summarize`, that turns the rows into
 * every figure on screen. The backend route, the agent's report and the tests all call it, so the
 * screen and the agent can never disagree about the month.
 *
 * Pure functions only: no storage, no network, no React.
 */

/** The mini app's name: its routes are `/rpc/<APP>/…`. */
export const APP = 'example-dashboard'
/** The collection: its routes are `/rpc/<APP>/<EXPENSES>`. */
export const EXPENSES = 'expenses'

export const CATEGORIES = ['housing', 'food', 'transport', 'health', 'fun', 'other'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABEL: Record<Category, string> = {
  housing: 'Housing',
  food: 'Food',
  transport: 'Transport',
  health: 'Health',
  fun: 'Fun',
  other: 'Other',
}

/**
 * Monthly budgets in USD. Illustrative: a real app would keep them in settings. The point is that
 * a target is data the summary is measured against, not a number buried in a component.
 */
export const MONTHLY_BUDGET: Record<Category, number> = {
  housing: 1500,
  food: 600,
  transport: 200,
  health: 150,
  fun: 250,
  other: 200,
}
export const TOTAL_BUDGET = CATEGORIES.reduce((sum, category) => sum + MONTHLY_BUDGET[category], 0)

/** How many months the trend looks back, this one included. */
export const TREND_MONTHS = 6

/**
 * What a person or the agent sends to record an expense.
 *
 * No field has `.default()`: a partial update would re-apply it on the current Localix release and
 * reset the field. `date` is optional and filled with today in the collection's `create`.
 */
export const expenseInputSchema = z.object({
  title: z.string().trim().min(1, 'Name the expense.').max(120),
  category: z.enum(CATEGORIES),
  amount: z.number().positive('Enter an amount above 0.').max(10_000_000),
  /** `YYYY-MM-DD`, the day it was spent. Today when omitted on create. */
  date: z.iso.date('Use a valid date.').optional(),
})

/** One stored expense: the input with the fields the server always fills. */
export const expenseSchema = expenseInputSchema.extend({ id: z.string(), date: z.string() })
export type Expense = z.infer<typeof expenseSchema>
export type ExpenseInput = z.input<typeof expenseInputSchema>

/** Every number the screen shows, as the `/summary` route answers it. */
export const summarySchema = z.object({
  /** The month summarised, `YYYY-MM`. */
  month: z.string(),
  spent: z.number(),
  count: z.number(),
  previousSpent: z.number(),
  /** Change against last month as a fraction (0.12 is +12%); null when last month was empty. */
  change: z.number().nullable(),
  /** Where the month ends if the pace so far holds. */
  projected: z.number(),
  largest: z.object({ title: z.string(), amount: z.number(), category: z.enum(CATEGORIES) }).nullable(),
  byCategory: z.array(
    z.object({
      category: z.enum(CATEGORIES),
      count: z.number(),
      total: z.number(),
      budget: z.number(),
    }),
  ),
  byMonth: z.array(z.object({ month: z.string(), total: z.number(), count: z.number() })),
})
export type Summary = z.infer<typeof summarySchema>

/** A local month as `YYYY-MM`: the first seven characters of an expense's `date`. */
export const monthKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

/** The months from `count - 1` months ago up to `now`'s month. */
export function lastMonths(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    monthKey(new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1)),
  )
}

const sum = (list: readonly Expense[]) => list.reduce((total, each) => total + each.amount, 0)

/** Every dashboard number, computed in one place. `now` is a parameter so tests pin the month. */
export function summarize(expenses: readonly Expense[], now: Date): Summary {
  const month = monthKey(now)
  const byMonth = lastMonths(now, TREND_MONTHS).map((key) => {
    const inMonth = expenses.filter((each) => each.date.startsWith(key))
    return { month: key, total: sum(inMonth), count: inMonth.length }
  })
  const thisMonth = expenses.filter((each) => each.date.startsWith(month))
  const previousSpent = byMonth.at(-2)?.total ?? 0
  const spent = sum(thisMonth)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const largest = [...thisMonth].sort((a, b) => b.amount - a.amount)[0]
  return {
    month,
    spent,
    count: thisMonth.length,
    previousSpent,
    change: previousSpent === 0 ? null : (spent - previousSpent) / previousSpent,
    projected: (spent / now.getDate()) * daysInMonth,
    largest: largest
      ? { title: largest.title, amount: largest.amount, category: largest.category }
      : null,
    byCategory: CATEGORIES.map((category) => {
      const inCategory = thisMonth.filter((each) => each.category === category)
      return {
        category,
        count: inCategory.length,
        total: sum(inCategory),
        budget: MONTHLY_BUDGET[category],
      }
    }),
    byMonth,
  }
}
