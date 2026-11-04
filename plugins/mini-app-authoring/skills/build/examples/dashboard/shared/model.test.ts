import { describe, expect, test } from 'bun:test'
import { NOW, fixtureExpenses } from './fixtures'
import { expenseInputSchema, lastMonths, summarize } from './model'

describe('summarize', () => {
  const summary = summarize(fixtureExpenses(), NOW)

  test('adds up the month, and compares it with the one before', () => {
    expect(summary).toMatchObject({ month: '2026-11', spent: 2300, count: 4, previousSpent: 1800 })
    expect(summary.change).toBeCloseTo(500 / 1800)
  })

  test('projects the month from the pace so far', () => {
    // 15 of 30 days gone, $2,300 spent.
    expect(summary.projected).toBe(4600)
  })

  test('totals every category, in the model order, including the empty ones', () => {
    expect(summary.byCategory.map((row) => [row.category, row.total, row.count])).toEqual([
      ['housing', 1500, 1],
      ['food', 500, 2],
      ['transport', 0, 0],
      ['health', 0, 0],
      ['fun', 300, 1],
      ['other', 0, 0],
    ])
  })

  test('the trend has one point per month, oldest first, with the empty months in it', () => {
    expect(summary.byMonth.map((point) => [point.month, point.total])).toEqual([
      ['2026-06', 0],
      ['2026-07', 0],
      ['2026-08', 0],
      ['2026-09', 0],
      ['2026-10', 1800],
      ['2026-11', 2300],
    ])
  })

  test('names the largest expense of the month', () => {
    expect(summary.largest).toEqual({ title: 'Rent', amount: 1500, category: 'housing' })
  })

  test('an empty ledger is zeros and nulls, never NaN', () => {
    const empty = summarize([], NOW)
    expect(empty).toMatchObject({ spent: 0, count: 0, projected: 0, change: null, largest: null })
    expect(Number.isNaN(empty.projected)).toBe(false)
  })

  test('months roll over the year boundary', () => {
    expect(lastMonths(new Date(2026, 1, 10), 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})

describe('the input schema', () => {
  test('refuses what the app cannot keep, with a sentence a person can read', () => {
    const refused = (input: unknown) => {
      const result = expenseInputSchema.safeParse(input)
      return result.success ? null : result.error.issues[0]!.message
    }
    expect(refused({ title: ' ', category: 'food', amount: 5 })).toBe('Name the expense.')
    expect(refused({ title: 'x', category: 'food', amount: 0 })).toBe('Enter an amount above 0.')
    expect(refused({ title: 'x', category: 'food', amount: 5, date: '2026-13-40' })).toBe(
      'Use a valid date.',
    )
    expect(refused({ title: 'x', category: 'cars', amount: 5 })).not.toBeNull()
  })

  test('has no defaults, so a partial update cannot reset a field', () => {
    expect(expenseInputSchema.partial().parse({})).toEqual({})
  })
})
