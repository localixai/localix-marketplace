import { defineCollection } from '@localixai/mini-app-sdk/backend'
import { EXPENSES, expenseInputSchema, expenseSchema } from '../shared/model'
import { monthKey } from '../shared/model'

/** Today as a local `YYYY-MM-DD`, the day an expense without a date was spent. */
const today = (now: Date) => `${monthKey(now)}-${String(now.getDate()).padStart(2, '0')}`

/**
 * The expenses collection. `createMiniApp` turns it into the store, the routes
 * `/rpc/<app>/expenses` (list, add, change, remove — each answering with the new list) and the
 * feed that keeps an open screen current. The dashboard reads it only through `/summary`.
 */
export const expensesSpec = defineCollection({
  name: EXPENSES,
  item: expenseSchema,
  input: expenseInputSchema,
  // Defaults live here, not in the input schema: a change keeps every field it does not send.
  create: (input, { id, now }) => ({ ...input, id, date: input.date ?? today(now) }),
  scope: 'app',
  limit: 20_000,
})
