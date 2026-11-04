import { describe, expect, test } from 'bun:test'
import {
  callTool,
  fakeSemantic,
  requestRoute,
  testMiniAppContext,
} from '@localixai/mini-app-sdk/backend/testing'
import type { Item } from '../shared/model'
import { register } from './index'

/** The list as the screen reads it. */
async function itemsOf(app: ReturnType<typeof register>): Promise<Item[]> {
  return ((await requestRoute(app, 'GET', '/items')).json as { items: Item[] }).items
}

/**
 * The backend tested through what the agent and the screen do: the agent's tools and the screen's
 * routes, on one store. Keep this shape when you change the domain: one test per thing a person or
 * the agent does, asserting what they are told back.
 */
describe('Starter', () => {
  test('what the agent adds is on the screen, and what the screen adds the agent sees', async () => {
    await using ctx = await testMiniAppContext({ name: 'template' })
    const app = register(ctx)

    const added = await callTool(app, 'template_add_item', { title: 'Buy milk' })
    expect(added).toEqual({ text: expect.stringContaining('Added "Buy milk".'), isError: false })

    const screen = await requestRoute(app, 'POST', '/items', { title: 'Call the dentist' })
    expect(screen.json).toEqual({
      items: [
        expect.objectContaining({ title: 'Buy milk', done: false, note: '' }),
        expect.objectContaining({ title: 'Call the dentist', done: false }),
      ],
    })
    const listed = await callTool(app, 'template_list_items', {})
    expect(listed.text).toContain('2 items, 2 open.')
    expect(listed.text).toContain('- [ ] Call the dentist')
  })

  test('a change keeps every field it does not name', async () => {
    await using ctx = await testMiniAppContext({ name: 'template' })
    const app = register(ctx)
    await callTool(app, 'template_add_item', { title: 'Buy milk', note: 'oat' })
    const [{ id }] = await itemsOf(app)

    const changed = await callTool(app, 'template_update_item', { id, done: true })
    expect(changed.isError).toBe(false)
    expect(await itemsOf(app)).toEqual([
      expect.objectContaining({ id, title: 'Buy milk', note: 'oat', done: true }),
    ])
  })

  test('the agent is told when an id it acts on is not there, and nothing changes', async () => {
    await using ctx = await testMiniAppContext({ name: 'template' })
    const app = register(ctx)
    await callTool(app, 'template_add_item', { title: 'Buy milk' })

    for (const tool of ['template_update_item', 'template_remove_item']) {
      const missed = await callTool(app, tool, { id: 'nope', done: true })
      expect(missed).toEqual({ text: expect.stringContaining('No item has that id'), isError: true })
    }
    expect(await itemsOf(app)).toHaveLength(1)
  })

  test('the agent is shown the limits the list keeps, so a call it makes is one the list accepts', async () => {
    await using ctx = await testMiniAppContext({ name: 'template' })
    const tool = register(ctx).tools?.find((t) => t.name === 'template_add_item')
    const accepts = (input: unknown) => tool?.inputSchema?.safeParse(input).success

    expect(accepts({ title: 'Buy milk' })).toBe(true)
    expect(accepts({ title: '   ' })).toBe(false)
    expect(accepts({ title: 'x'.repeat(201) })).toBe(false)
  })

  test('finds an item by meaning, and is told when search is not ready', async () => {
    const semantic = fakeSemantic()
    await using ctx = await testMiniAppContext({ name: 'template', host: { semantic } })
    const app = register(ctx)
    await callTool(app, 'template_add_item', { title: 'Book a dentist appointment' })
    await callTool(app, 'template_add_item', { title: 'Buy milk' })

    const early = await callTool(app, 'template_find_items', { query: 'dentist' })
    expect(early.text).toContain('search is not ready')
    semantic.ready = true
    const found = await callTool(app, 'template_find_items', { query: 'dentist' })
    expect(found.text).toContain('Book a dentist appointment')
    expect(found.text).not.toContain('Buy milk')
  })
})
