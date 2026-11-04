import type { Expense } from './model'

/**
 * A small, fixed month for the tests: "now" is 15 November 2026. Numbers worked out by hand so a
 * test can state what a person should read: spent $2,300 (October was $1,800, so +28%), the pace
 * ends the month at $4,600, Food is at 83% of its budget and Fun is $50 over.
 */
export const NOW = new Date(2026, 10, 15, 12)

const expense = (
  id: string,
  title: string,
  category: Expense['category'],
  amount: number,
  date: string,
): Expense => ({ id, title, category, amount, date })

export const fixtureExpenses = (): Expense[] => [
  expense('o1', 'Rent', 'housing', 1500, '2026-10-01'),
  expense('o2', 'Groceries', 'food', 300, '2026-10-05'),
  expense('n1', 'Rent', 'housing', 1500, '2026-11-01'),
  expense('n2', 'Groceries', 'food', 430, '2026-11-03'),
  expense('n3', 'Dinner out', 'food', 70, '2026-11-09'),
  expense('n4', 'Concert', 'fun', 300, '2026-11-12'),
]
