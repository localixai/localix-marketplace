import { describe, expect, test } from 'bun:test'
import { callTool, requestRoute, testMiniAppContext } from '@localixai/mini-app-sdk/backend/testing'
import type { Link, Look, Note } from '../shared/model'
import { register } from './index'

const CHAT = { sessionId: 'chat-a' }

type App = ReturnType<typeof register>
const notesOf = async (app: App, sessionId = CHAT.sessionId) =>
  ((await requestRoute(app, 'GET', '/notes', undefined, { sessionId })).json as { items: Note[] })
    .items
const linksOf = async (app: App) =>
  ((await requestRoute(app, 'GET', '/links', undefined, CHAT)).json as { items: Link[] }).items
const looksOf = async (app: App) =>
  ((await requestRoute(app, 'GET', '/looks', undefined, CHAT)).json as { items: Look[] }).items

/** Add a note as the agent does and answer its id. */
async function note(app: App, text: string, extra: object = {}) {
  await callTool(app, 'canvas_board_add_note', { text, ...extra }, CHAT)
  return (await notesOf(app)).find((each) => each.text === text)!.id
}

/**
 * The backend tested through what the agent and the screen do: the agent's tools and the screen's
 * routes, on one chat's store. One test per thing a person or the agent does.
 */
describe('Canvas Board', () => {
  test('what the agent adds is on the screen, in the next free slot each time', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-canvas-board' })
    const app = register(ctx)
    const first = await callTool(app, 'canvas_board_add_note', { text: 'Plan' }, CHAT)
    expect(first.isError).toBe(false)
    expect(first.text).toContain('1 note, 0 links.')
    await callTool(app, 'canvas_board_add_note', { text: 'Risk', tone: 'warning' }, CHAT)
    expect(await notesOf(app)).toEqual([
      expect.objectContaining({ text: 'Plan', x: 0, y: 0, tone: 'neutral' }),
      expect.objectContaining({ text: 'Risk', x: 248, y: 0, tone: 'warning' }),
    ])
  })

  test('a drag the screen saves keeps the text and tone it does not send', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-canvas-board' })
    const app = register(ctx)
    const id = await note(app, 'Plan', { tone: 'info' })
    const saved = await requestRoute(app, 'PATCH', `/notes/${id}`, { x: 400, y: 120 }, CHAT)
    expect(saved.status).toBe(200)
    expect(await notesOf(app)).toEqual([
      expect.objectContaining({ text: 'Plan', tone: 'info', x: 400, y: 120 }),
    ])
  })

  test('connecting names real notes, never itself, and a second connect relabels', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-canvas-board' })
    const app = register(ctx)
    const a = await note(app, 'A')
    const b = await note(app, 'B')

    const lost = await callTool(app, 'canvas_board_connect', { from: a, to: 'nope' }, CHAT)
    expect(lost).toEqual({ text: expect.stringContaining('not a note'), isError: true })
    const self = await callTool(app, 'canvas_board_connect', { from: a, to: a }, CHAT)
    expect(self.isError).toBe(true)

    await callTool(app, 'canvas_board_connect', { from: a, to: b }, CHAT)
    const again = await callTool(
      app,
      'canvas_board_connect',
      { from: a, to: b, label: 'then' },
      CHAT,
    )
    expect(again.text).toContain('A -> B [then]')
    expect(await linksOf(app)).toEqual([expect.objectContaining({ from: a, to: b, label: 'then' })])
  })

  test('removing a note takes its links with it', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-canvas-board' })
    const app = register(ctx)
    const a = await note(app, 'A')
    const b = await note(app, 'B')
    await callTool(app, 'canvas_board_connect', { from: a, to: b }, CHAT)
    const removed = await callTool(app, 'canvas_board_remove_note', { id: a }, CHAT)
    expect(removed.text).toContain('1 note, 0 links.')
    expect(await linksOf(app)).toEqual([])
    const missing = await callTool(app, 'canvas_board_remove_note', { id: a }, CHAT)
    expect(missing.isError).toBe(true)
  })

  test('layers puts the start of a chain on the left and follows the arrows right', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-canvas-board' })
    const app = register(ctx)
    const a = await note(app, 'A')
    const b = await note(app, 'B')
    const c = await note(app, 'C')
    await callTool(app, 'canvas_board_connect', { from: a, to: b }, CHAT)
    await callTool(app, 'canvas_board_connect', { from: b, to: c }, CHAT)
    const done = await callTool(app, 'canvas_board_arrange', { how: 'layers' }, CHAT)
    expect(done.text).toContain('Arranged 3 notes as layers.')
    const xs = Object.fromEntries((await notesOf(app)).map((each) => [each.text, each.x]))
    expect(xs).toEqual({ A: 0, B: 248, C: 496 })
  })

  test('looking leaves one request, for the notes that exist', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-canvas-board' })
    const app = register(ctx)
    const a = await note(app, 'A')
    const b = await note(app, 'B')
    await callTool(app, 'canvas_board_look', { noteIds: [a] }, CHAT)
    const second = await callTool(app, 'canvas_board_look', { noteIds: [b, 'ghost'] }, CHAT)
    expect(second.isError).toBe(false)
    expect(second.text).toContain('1 of 2')
    expect(second.text).toContain('ghost')
    expect(await looksOf(app)).toEqual([expect.objectContaining({ noteIds: [b] })])

    const nothing = await callTool(app, 'canvas_board_look', { noteIds: ['ghost'] }, CHAT)
    expect(nothing.isError).toBe(true)
    expect(await looksOf(app)).toHaveLength(1)
  })

  test('each chat has its own board', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-canvas-board' })
    const app = register(ctx)
    await callTool(app, 'canvas_board_add_note', { text: 'Mine' }, { sessionId: 'chat-a' })
    expect(await notesOf(app, 'chat-b')).toEqual([])
    const read = await callTool(app, 'canvas_board_list', {}, { sessionId: 'chat-b' })
    expect(read.text).toBe('The board is empty.')
    const outside = await requestRoute(app, 'GET', '/notes')
    expect(outside.status).toBe(400)
  })
})
