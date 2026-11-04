import { describe, expect, test } from 'bun:test'
import { callTool, requestRoute, testMiniAppContext } from '@localixai/mini-app-sdk/backend/testing'
import { lastMonths, monthKey, summarySchema, type Expense } from '../shared/model'
import { describeSummary } from '../shared/report'
import { register } from './index'

const summaryOf = async (app: ReturnType<typeof register>) =>
  summarySchema.parse((await requestRoute(app, 'GET', '/summary')).json)

const now = new Date()
const thisMonth = monthKey(now)
const lastMonth = lastMonths(now, 2)[0]!

/**
 * The backend tested through what the agent and the screen do: the agent's tools and the screen's
 * routes, on one store. The dates are built from today's month, because `/summary` reads the clock.
 */
describe('Example Dashboard backend', () => {
  test('an empty ledger summarises to zeros', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-dashboard' })
    const summary = await summaryOf(register(ctx))
    expect(summary).toMatchObject({ month: thisMonth, spent: 0, count: 0, change: null })
    expect(summary.byMonth).toHaveLength(6)
  })

  test('what the agent records is in the summary the screen reads', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-dashboard' })
    const app = register(ctx)
    const added = await callTool(app, 'example_dashboard_add_expense', {
      title: 'Groceries',
      category: 'food',
      amount: 42,
    })
    expect(added).toEqual({ text: expect.stringContaining('Recorded $42'), isError: false })
    const summary = await summaryOf(app)
    expect(summary).toMatchObject({ spent: 42, count: 1 })
    expect(summary.byCategory.find((row) => row.category === 'food')?.total).toBe(42)
  })

  test('an expense without a date is today, and one with a date keeps it', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-dashboard' })
    const app = register(ctx)
    await callTool(app, 'example_dashboard_add_expense', { title: 'Taxi', category: 'transport', amount: 9 })
    await callTool(app, 'example_dashboard_add_expense', {
      title: 'Old bill',
      category: 'health',
      amount: 70,
      date: `${lastMonth}-02`,
    })
    const { items } = (await requestRoute(app, 'GET', '/expenses')).json as { items: Expense[] }
    expect(items.find((each) => each.title === 'Taxi')?.date.startsWith(thisMonth)).toBe(true)
    expect(items.find((each) => each.title === 'Old bill')?.date).toBe(`${lastMonth}-02`)
    expect((await summaryOf(app)).previousSpent).toBe(70)
  })

  test('a change from the screen keeps the fields it does not send', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-dashboard' })
    const app = register(ctx)
    await requestRoute(app, 'POST', '/expenses', { title: 'Rent', category: 'housing', amount: 900 })
    const [{ id, date }] = ((await requestRoute(app, 'GET', '/expenses')).json as { items: Expense[] }).items
    await requestRoute(app, 'PATCH', `/expenses/${id}`, { amount: 950 })
    const [after] = ((await requestRoute(app, 'GET', '/expenses')).json as { items: Expense[] }).items
    expect(after).toMatchObject({ amount: 950, category: 'housing', date })
  })

  test('the report tool says what the /summary route says: one function behind both', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-dashboard' })
    const app = register(ctx)
    await callTool(app, 'example_dashboard_add_expense', { title: 'Rent', category: 'housing', amount: 1500 })
    await callTool(app, 'example_dashboard_add_expense', {
      title: 'Dentist',
      category: 'health',
      amount: 200,
      date: `${lastMonth}-03`,
    })
    const report = await callTool(app, 'example_dashboard_report', {})
    expect(report.isError).toBe(false)
    expect(report.text).toBe(describeSummary(await summaryOf(app)))
  })

  test('the agent is shown the limits the app keeps, so a call it makes is one the app accepts', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-dashboard' })
    const tool = register(ctx).tools?.find((t) => t.name === 'example_dashboard_add_expense')
    const accepts = (input: unknown) => tool?.inputSchema?.safeParse(input).success
    expect(accepts({ title: 'Taxi', category: 'transport', amount: 9 })).toBe(true)
    expect(accepts({ title: 'Taxi', category: 'transport', amount: -9 })).toBe(false)
    expect(accepts({ title: 'Taxi', category: 'cars', amount: 9 })).toBe(false)
  })
})
