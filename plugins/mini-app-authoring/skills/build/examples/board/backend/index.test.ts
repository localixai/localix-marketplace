import { describe, expect, test } from 'bun:test'
import { onStoreWrite } from '@localixai/mini-app-sdk/backend'
import {
  TEST_CHAT,
  callTool,
  requestRoute,
  testMiniAppContext,
} from '@localixai/mini-app-sdk/backend/testing'
import type { Card } from '../shared/model'
import { register } from './index'

/** The board of a chat as the screen reads it: the route takes the chat in the query. */
async function cardsOf(app: ReturnType<typeof register>, sessionId = TEST_CHAT): Promise<Card[]> {
  const answer = await requestRoute(app, 'GET', '/cards', undefined, { sessionId })
  return (answer.json as { items: Card[] }).items
}

/**
 * The backend tested through what the agent and the screen do, on one store: the agent's tools and
 * the screen's routes, each in the chat they belong to.
 */
describe('Example board', () => {
  test('what the agent adds is on the screen, starting in the Backlog', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-board' })
    const app = register(ctx)

    const added = await callTool(app, 'example_board_add_card', {
      title: 'Write the release notes',
      points: 3,
      due: '2026-11-12',
    })
    expect(added.isError).toBe(false)
    expect(added.text).toContain('Added "Write the release notes" to Backlog.')
    expect(await cardsOf(app)).toEqual([
      expect.objectContaining({
        title: 'Write the release notes',
        stage: 'backlog',
        points: 3,
        due: '2026-11-12',
        note: '',
        assignee: '',
      }),
    ])
  })

  test('the agent moves a card, and the screen sees it in its new column', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-board' })
    const app = register(ctx)
    await callTool(app, 'example_board_add_card', { title: 'Fix the login bug' })
    const [{ id }] = await cardsOf(app)

    const moved = await callTool(app, 'example_board_move_card', { id, stage: 'review' })
    expect(moved.isError).toBe(false)
    expect(moved.text).toContain('Moved "Fix the login bug" from Backlog to Review.')
    expect(moved.text).toContain('Review — 1 card')
    expect(await cardsOf(app)).toEqual([expect.objectContaining({ id, stage: 'review' })])
  })

  test('a move the screen makes keeps every other field of the card', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-board' })
    const app = register(ctx)
    await callTool(app, 'example_board_add_card', { title: 'Plan', points: 5, assignee: 'Maya' })
    const [{ id }] = await cardsOf(app)

    await requestRoute(app, 'PATCH', `/cards/${id}`, { stage: 'doing' }, { sessionId: TEST_CHAT })
    expect(await cardsOf(app)).toEqual([
      expect.objectContaining({ stage: 'doing', points: 5, assignee: 'Maya' }),
    ])
  })

  test('the agent writes the store the open board is watching, so the board can follow', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-board' })
    const app = register(ctx)
    await callTool(app, 'example_board_add_card', { title: 'Ship it' })
    const [{ id }] = await cardsOf(app)

    // The host's store feed turns every committed write into a nudge to the open screens; a tool
    // write reaches it because it goes through the collection, like the screen's own writes.
    const writes: string[] = []
    const stop = onStoreWrite((path) => writes.push(path))
    await callTool(app, 'example_board_move_card', { id, stage: 'done' })
    stop()
    expect(writes.length).toBeGreaterThan(0)
  })

  test('each chat has its own board', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-board' })
    const app = register(ctx)
    await callTool(app, 'example_board_add_card', { title: 'Here' }, { sessionId: 'chat-a' })
    await callTool(app, 'example_board_add_card', { title: 'There' }, { sessionId: 'chat-b' })

    expect((await cardsOf(app, 'chat-a')).map((card) => card.title)).toEqual(['Here'])
    expect((await cardsOf(app, 'chat-b')).map((card) => card.title)).toEqual(['There'])
    const [{ id }] = await cardsOf(app, 'chat-a')
    // A card id from another chat is not a card here.
    const missed = await callTool(
      app,
      'example_board_move_card',
      { id, stage: 'done' },
      { sessionId: 'chat-b' },
    )
    expect(missed).toEqual({ text: expect.stringContaining('No card has that id'), isError: true })
  })

  test('the agent is told when a card is not there or already in place, and nothing changes', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-board' })
    const app = register(ctx)
    await callTool(app, 'example_board_add_card', { title: 'Plan' })
    const [{ id }] = await cardsOf(app)

    const missed = await callTool(app, 'example_board_move_card', { id: 'nope', stage: 'done' })
    expect(missed).toEqual({ text: expect.stringContaining('No card has that id'), isError: true })
    const same = await callTool(app, 'example_board_move_card', { id, stage: 'backlog' })
    expect(same).toEqual({ text: expect.stringContaining('already in Backlog'), isError: false })
  })

  test('the agent is shown the limits the board keeps, so a call it makes is one the board accepts', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-board' })
    const tool = register(ctx).tools?.find((t) => t.name === 'example_board_add_card')
    const accepts = (input: unknown) => tool?.inputSchema?.safeParse(input).success

    expect(accepts({ title: 'Plan', points: 3, due: '2026-11-12' })).toBe(true)
    expect(accepts({ title: '   ' })).toBe(false)
    expect(accepts({ title: 'Plan', points: 0 })).toBe(false)
    expect(accepts({ title: 'Plan', stage: 'someday' })).toBe(false)
  })
})
