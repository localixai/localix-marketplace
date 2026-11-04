import { describe, expect, test } from 'bun:test'
import { NOW, fixtureExpenses } from './fixtures'
import { summarize } from './model'
import { budgetsOf, describeSummary, insightsOf, toneOf } from './report'

const summary = summarize(fixtureExpenses(), NOW)

describe('the words for the numbers', () => {
  test('insights say what the numbers mean', () => {
    expect(insightsOf(summary)).toEqual([
      '$2,300 spent in November 2026, +28% against October.',
      'Housing is the biggest category: $1,500, 65% of the month.',
      'Fun is $50 over its $250 budget.',
      'At this pace the month ends at $4,600, $1,700 over the $2,900 budget.',
      'The largest expense is Rent: $1,500 (Housing).',
    ])
  })

  test('an empty month says so instead of printing zeros', () => {
    expect(insightsOf(summarize([], NOW))).toEqual(['Nothing has been spent in November 2026 yet.'])
  })

  test('with no month to compare with it does not invent a change', () => {
    const onlyThisMonth = fixtureExpenses().filter((each) => each.date.startsWith('2026-11'))
    expect(insightsOf(summarize(onlyThisMonth, NOW))[0]).toContain('no spending last month')
  })

  test('tone runs the way spending does: more is worse', () => {
    expect([0, 0.79, 0.8, 0.99, 1, 1.4].map(toneOf)).toEqual([
      'success',
      'success',
      'warning',
      'warning',
      'error',
      'error',
    ])
  })

  test('the budget rows start with the whole month, then each category', () => {
    expect(budgetsOf(summary).map((row) => row.label)).toEqual([
      'This month',
      'Housing',
      'Food',
      'Transport',
      'Health',
      'Fun',
      'Other',
    ])
  })

  test('the agent report carries the headline, the budgets and the same insights', () => {
    const report = describeSummary(summary)
    expect(report).toContain('Spending in November 2026: $2,300 across 4 expenses.')
    expect(report).toContain('- Food: $500 of $600 (83%, close to the limit)')
    expect(report).toContain('- Fun: $300 of $250 (120%, over budget)')
    for (const sentence of insightsOf(summary)) expect(report).toContain(sentence)
  })
})
