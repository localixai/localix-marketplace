import { describe, expect, test } from 'bun:test'
import type { MiniAppWakeRequest } from '@localixai/mini-app-sdk/backend'
import { callTool, requestRoute, testMiniAppContext } from '@localixai/mini-app-sdk/backend/testing'
import { gameSchema, type Game } from '../shared/game'
import { gameUri } from '../shared/resource'
import { ANSWER_TOOLS } from './ask'
import { register } from './index'

/**
 * The backend tested through what a person and the agent do: the screen's routes and the agent's
 * tool, on one board per chat. The wake is the host's `ctx.host.wake`, faked to record its
 * requests; the game lives in the test context's own folders.
 */
async function table() {
  const woke: MiniAppWakeRequest[] = []
  const ctx = await testMiniAppContext({
    name: 'example-game',
    host: { wake: async (request) => (woke.push(request), { status: 'delivered' as const }) },
  })
  // The test context has no `ui`; a tool that offers a view needs the one method it calls.
  Object.assign(ctx, { ui: { offer: (destination: unknown) => destination } })
  const app = register(ctx)
  const drop = (column: number, sessionId = 's1') =>
    requestRoute(app, 'POST', '/game/drop', { column }, { sessionId })
  const game = async (sessionId = 's1') =>
    gameSchema.parse((await requestRoute(app, 'GET', '/game', undefined, { sessionId })).json)
  return { app, woke, drop, game, [Symbol.asyncDispose]: () => ctx[Symbol.asyncDispose]() }
}

describe('a person plays, the agent answers', () => {
  test('a drop shows at once, wakes the chat the board belongs to, and the agent’s tool answers it', async () => {
    await using t = await table()
    const moved = await t.drop(3)
    expect(moved.status).toBe(200)
    const after = moved.json as Game
    expect(after.board[38]).toBe('you')
    expect(after.waiting).toMatchObject({ status: 'thinking' })

    // The wake names the chat, the one tool that answers it, and the position to answer.
    expect(t.woke).toHaveLength(1)
    expect(t.woke[0]).toMatchObject({ sessionId: 's1', tools: ANSWER_TOOLS })
    expect(t.woke[0]!.message).toContain('The user dropped X into column 4. Your move as O.')
    expect(t.woke[0]!.message).toContain('Call example_game with action "drop"')

    const answer = await callTool(
      t.app,
      'example_game',
      { action: 'drop', column: 4 },
      { sessionId: 's1' },
    )
    expect(answer.isError).toBe(false)
    expect(answer.text).toContain('You dropped O into column 4.')
    const now = await t.game()
    expect(now.board[31]).toBe('agent')
    expect(now.turn).toBe('you')
    expect(now.waiting).toBeNull()
    // The agent acting is never asked for anything: still the one wake.
    expect(t.woke).toHaveLength(1)
  })

  test('“Ask again” wakes the chat again under the same key, so the host can dedupe it', async () => {
    await using t = await table()
    await t.drop(3)
    await requestRoute(t.app, 'POST', '/game/remind', {}, { sessionId: 's1' })
    expect(t.woke).toHaveLength(2)
    expect(new Set(t.woke.map((request) => request.key)).size).toBe(1)
  })

  test('a refused drop is an error that shows the board as it now is', async () => {
    await using t = await table()
    // It is the user’s turn: the agent’s drop is refused and nothing changed.
    const early = await callTool(
      t.app,
      'example_game',
      { action: 'drop', column: 1 },
      { sessionId: 's1' },
    )
    expect(early.isError).toBe(true)
    expect(early.text).toContain('It is the user’s turn')
    expect(early.text).toContain('1 2 3 4 5 6 7')
    // The screen gets the same sentence as a 409.
    for (let i = 0; i < 6; i++) await t.drop(0)
    const refused = await requestRoute(
      t.app,
      'POST',
      '/game/drop',
      { column: 0 },
      { sessionId: 's1' },
    )
    expect(refused.status).toBe(409)
  })
})

describe('one board per chat', () => {
  test('another chat has its own game, and a call with no chat is refused', async () => {
    await using t = await table()
    await t.drop(3, 's1')
    expect((await t.game('s2')).moves).toHaveLength(0)
    const none = await requestRoute(t.app, 'GET', '/game')
    expect(none.status).toBe(404)
  })

  test('a new game offers the board in the chat it runs in', async () => {
    await using t = await table()
    // `callTool` answers text only; the offered link is in the result's `details`.
    const tool = t.app.tools!.find((each) => each.name === 'example_game')!
    const result = await tool.execute('call', { action: 'new_game' }, undefined, undefined, {
      session: { id: 's9', scratchDir: '/tmp' },
    } as never)
    expect(result.content).toContain('The user moves first')
    expect(JSON.stringify(result.details)).toContain(gameUri('s9'))
  })

  test('the agent can read the board without changing it', async () => {
    await using t = await table()
    await t.drop(2)
    const read = await callTool(t.app, 'example_game', { action: 'state' }, { sessionId: 's1' })
    expect(read.text).toContain('The user dropped X into column 3.')
    expect((await t.game()).moves).toHaveLength(1)
  })
})
