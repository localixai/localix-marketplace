import { describe, expect, test } from 'bun:test'
import { requestRoute, testMiniAppContext } from '@localixai/mini-app-sdk/backend/testing'
import { STAGES, summarySchema, type Activity, type Deal } from '../shared/model'
import { register } from './index'

const list = async <T>(app: ReturnType<typeof register>, path: string) =>
  ((await requestRoute(app, 'GET', path)).json as { items: T[] }).items

describe('UI patterns backend', () => {
  test('the first start seeds a realistic pipeline, once', async () => {
    await using ctx = await testMiniAppContext({ name: 'ui-patterns' })
    const app = register(ctx)
    // `/summary` waits for the seed, so everything after it sees the full demo set.
    await requestRoute(app, 'GET', '/summary')

    const deals = await list<Deal>(app, '/deals')
    expect(deals.length).toBe(14)
    expect(new Set(deals.map((deal) => deal.currency)).size).toBeLessThanOrEqual(3)
    for (const stage of STAGES) expect(deals.some((deal) => deal.stage === stage)).toBe(true)
    const activities = await list<Activity>(app, '/activities')
    expect(activities.length).toBeGreaterThanOrEqual(10)
    const ids = new Set(deals.map((deal) => deal.id))
    expect(activities.every((activity) => ids.has(activity.dealId))).toBe(true)

    // Another register (the host registers again for each run) must not seed twice.
    const again = register(ctx)
    await requestRoute(again, 'GET', '/summary')
    expect(await list<Deal>(again, '/deals')).toHaveLength(14)
  })

  test('deleting every deal does not bring the demo back', async () => {
    await using ctx = await testMiniAppContext({ name: 'ui-patterns' })
    const app = register(ctx)
    await requestRoute(app, 'GET', '/summary')
    for (const deal of await list<Deal>(app, '/deals')) {
      await requestRoute(app, 'DELETE', `/deals/${deal.id}`)
    }
    await requestRoute(register(ctx), 'GET', '/summary')
    expect(await list<Deal>(app, '/deals')).toEqual([])
  })

  test('/summary answers the numbers the dashboard shows', async () => {
    await using ctx = await testMiniAppContext({ name: 'ui-patterns' })
    const app = register(ctx)
    const summary = summarySchema.parse((await requestRoute(app, 'GET', '/summary')).json)

    expect(summary.byStage.map((row) => row.stage)).toEqual([...STAGES])
    expect(summary.openCount).toBe(9)
    expect(summary.wonCount).toBe(4)
    expect(summary.lostCount).toBe(1)
    expect(summary.winRate).toBeCloseTo(0.8)
    expect(summary.pipelineValue).toBeGreaterThan(0)
    expect(summary.closingThisMonth.count).toBeGreaterThanOrEqual(2)
    expect(summary.wonByMonth).toHaveLength(6)
    expect(summary.wonByMonth.some((month) => month.value > 0)).toBe(true)
  })

  test('a deal is created with the defaults the schema does not carry, and a stage move keeps the rest', async () => {
    await using ctx = await testMiniAppContext({ name: 'ui-patterns' })
    const app = register(ctx)
    await requestRoute(app, 'GET', '/summary')

    const created = await requestRoute(app, 'POST', '/deals', {
      title: 'New logo',
      company: 'Acme Test',
      owner: 'Maya Chen',
      amount: 5000,
    })
    const added = (created.json as { items: Deal[] }).items.find((d) => d.title === 'New logo')!
    expect(added).toMatchObject({ stage: 'lead', currency: 'USD', amount: 5000 })
    expect(added.createdAt).toMatch(/^\d{4}-\d\d-\d\dT/)

    const moved = await requestRoute(app, 'PATCH', `/deals/${added.id}`, { stage: 'qualified' })
    expect((moved.json as { items: Deal[] }).items.find((d) => d.id === added.id)).toMatchObject({
      stage: 'qualified',
      currency: 'USD',
      amount: 5000,
    })
  })

  test('a deal that breaks the schema is refused', async () => {
    await using ctx = await testMiniAppContext({ name: 'ui-patterns' })
    const app = register(ctx)
    await requestRoute(app, 'GET', '/summary')
    const refused = await requestRoute(app, 'POST', '/deals', { title: '', amount: -1 })
    expect(refused.status).toBeGreaterThanOrEqual(400)
  })
})
