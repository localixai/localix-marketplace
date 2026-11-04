import { describe, expect, test } from 'bun:test'
import {
  callTool,
  fakeSemantic,
  requestRoute,
  testMiniAppContext,
} from '@localixai/mini-app-sdk/backend/testing'
import type { Application, Company } from '../shared/model'
import { register } from './index'

const companiesOf = async (app: ReturnType<typeof register>) =>
  ((await requestRoute(app, 'GET', '/companies')).json as { items: Company[] }).items
const applicationsOf = async (app: ReturnType<typeof register>) =>
  ((await requestRoute(app, 'GET', '/applications')).json as { items: Application[] }).items

/**
 * The backend tested through what the agent and the screen do: the agent's tools and the screen's
 * routes, on one store. One test per thing a person or the agent does, asserting what they are
 * told back.
 */
describe('Tracker', () => {
  test('an application added by the agent creates its company once and shows on the screen', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-tracker' })
    const app = register(ctx)

    const first = await callTool(app, 'example_tracker_add_application', {
      company: 'Acme',
      role: 'Designer',
      status: 'applied',
    })
    expect(first).toEqual({
      text: expect.stringContaining('Added "Designer" at Acme.'),
      isError: false,
    })
    await callTool(app, 'example_tracker_add_application', { company: ' acme ', role: 'Writer' })

    expect(await companiesOf(app)).toEqual([expect.objectContaining({ name: 'Acme' })])
    expect(await applicationsOf(app)).toEqual([
      expect.objectContaining({
        role: 'Designer',
        status: 'applied',
        appliedOn: expect.any(String),
      }),
      expect.objectContaining({ role: 'Writer', status: 'wishlist', appliedOn: null }),
    ])
  })

  test('a status change adds to the timeline and keeps every field it does not name', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-tracker' })
    const app = register(ctx)
    await callTool(app, 'example_tracker_add_application', {
      company: 'Acme',
      role: 'Designer',
      salary: 90000,
      note: 'Remote',
    })
    const [{ id }] = await applicationsOf(app)

    const changed = await callTool(app, 'example_tracker_update_application', {
      id,
      status: 'interview',
    })
    expect(changed.isError).toBe(false)
    const [after] = await applicationsOf(app)
    expect(after).toMatchObject({ status: 'interview', salary: 90000, note: 'Remote' })
    expect(after!.history.map((entry) => entry.status)).toEqual(['wishlist', 'interview'])

    // Saying the status it already has adds nothing.
    await callTool(app, 'example_tracker_update_application', {
      id,
      status: 'interview',
      note: 'Round 2',
    })
    expect((await applicationsOf(app))[0]!.history).toHaveLength(2)
  })

  test('removing a company removes its applications, from the screen or from the chat', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-tracker' })
    const app = register(ctx)
    for (const [company, role] of [
      ['Acme', 'Designer'],
      ['Acme', 'Writer'],
      ['Globex', 'Analyst'],
    ]) {
      await callTool(app, 'example_tracker_add_application', { company, role })
    }
    const [acme, globex] = await companiesOf(app)

    // The screen: the cascade route.
    const screen = await requestRoute(app, 'DELETE', `/companies/${acme!.id}/with-applications`)
    expect(screen.json).toEqual({ items: [expect.objectContaining({ name: 'Globex' })] })
    expect((await applicationsOf(app)).map((each) => each.role)).toEqual(['Analyst'])

    // The chat: the same rule through the tool, which says how many went with it.
    const chat = await callTool(app, 'example_tracker_remove_company', { id: globex!.id })
    expect(chat.text).toContain('Removed Globex and 1 application.')
    expect(await applicationsOf(app)).toEqual([])
    expect(await companiesOf(app)).toEqual([])
  })

  test('the agent is told when an id it acts on is not there, and nothing changes', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-tracker' })
    const app = register(ctx)
    await callTool(app, 'example_tracker_add_application', { company: 'Acme', role: 'Designer' })

    const missed = await callTool(app, 'example_tracker_update_application', {
      id: 'nope',
      status: 'offer',
    })
    expect(missed).toEqual({
      text: expect.stringContaining('No application has that id'),
      isError: true,
    })
    const company = await callTool(app, 'example_tracker_remove_company', { id: 'nope' })
    expect(company.isError).toBe(true)
    expect(await applicationsOf(app)).toHaveLength(1)
    expect((await requestRoute(app, 'DELETE', '/companies/nope/with-applications')).status).toBe(
      404,
    )
  })

  test('the agent is shown the limits the app keeps', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-tracker' })
    const tool = register(ctx).tools?.find((t) => t.name === 'example_tracker_add_application')
    const accepts = (input: unknown) => tool?.inputSchema?.safeParse(input).success

    expect(accepts({ company: 'Acme', role: 'Designer' })).toBe(true)
    expect(accepts({ company: 'Acme', role: '  ' })).toBe(false)
    expect(accepts({ company: 'Acme', role: 'Designer', salary: -1 })).toBe(false)
    expect(accepts({ company: 'Acme', role: 'Designer', appliedOn: '03/11/2026' })).toBe(false)
  })

  test('finds an application by meaning, through its company too, and says when search is not ready', async () => {
    const semantic = fakeSemantic()
    await using ctx = await testMiniAppContext({ name: 'example-tracker', host: { semantic } })
    const app = register(ctx)
    await callTool(app, 'example_tracker_add_application', {
      company: 'Acme Robotics',
      role: 'Designer',
    })
    await callTool(app, 'example_tracker_add_application', { company: 'Globex', role: 'Analyst' })

    expect((await callTool(app, 'example_tracker_find', { query: 'robotics' })).text).toContain(
      'not ready',
    )
    semantic.ready = true
    const found = await callTool(app, 'example_tracker_find', { query: 'robotics' })
    expect(found.text).toContain('Designer at Acme Robotics')
    expect(found.text).not.toContain('Analyst')
  })

  test('the report counts what is live and names what waited too long', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-tracker' })
    const app = register(ctx)
    await callTool(app, 'example_tracker_add_application', {
      company: 'Acme',
      role: 'Designer',
      status: 'applied',
    })
    await callTool(app, 'example_tracker_add_application', {
      company: 'Globex',
      role: 'Analyst',
      status: 'rejected',
    })

    const { text } = await callTool(app, 'example_tracker_report', {})
    expect(text).toContain('2 applications at 2 companies, 1 still live.')
    expect(text).toContain('1 applied, 1 rejected.')
  })
})
