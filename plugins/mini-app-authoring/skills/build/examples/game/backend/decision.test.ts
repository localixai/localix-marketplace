import { describe, expect, test } from 'bun:test'
import type { DecisionHost, DecisionOutcome } from '@localixai/mini-app-sdk/backend'
import { testMiniAppContext } from '@localixai/mini-app-sdk/backend/testing'
import { dropChip, newGame } from '../shared/game'
import { moveAsk } from './ask'
import { createGameService } from './game-service'

const CHAT = { userId: 'u1', sessionId: 's1' }
const AT = '2026-11-03T10:00:00.000Z'

/** A decision host that answers every ask with the column `pick` names, or with a miss. */
function decider(pick: () => string | DecisionOutcome) {
  const asked: string[] = []
  const host: DecisionHost = {
    available: async () => ({ model: 'decider' }),
    decide: async (_userId, _ask, options) => {
      asked.push(options.sessionId ?? '')
      const answer = pick()
      return typeof answer === 'string'
        ? {
            status: 'answered',
            model: 'decider',
            ms: 3,
            answers: { move: { type: 'choice', choice: answer, probabilities: { [answer]: 0.9 } } },
          }
        : answer
    },
  }
  return { host, asked }
}

async function service(decisions?: DecisionHost) {
  const woke: unknown[] = []
  const ctx = await testMiniAppContext({ name: 'example-game' })
  let ids = 0
  const games = createGameService({
    resolveDir: (...args) => ctx.sessionStorage!.resolveDataDir(...args),
    wake: async (request) => (woke.push(request), { status: 'delivered' as const }),
    ...(decisions ? { decisions } : {}),
    now: () => AT,
    newId: () => `g${++ids}`,
  })
  return { games, woke, [Symbol.asyncDispose]: () => ctx[Symbol.asyncDispose]() }
}

describe('the question the decision model is asked', () => {
  test('the open columns are the options, and what code sees for certain is in the state', () => {
    // The user has three on the floor (columns 1–3) and the agent two in column 7.
    let game = newGame({ id: 'g', first: 'you', now: AT })
    for (const column of [0, 6, 1, 6, 2]) game = dropChip(game, column, game.turn, AT)
    const ask = moveAsk(game)
    expect(Object.keys(ask.questions.move!.criteria)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(ask.state).toMatchObject({
      columns_where_o_wins_now: [],
      columns_where_x_wins_next: [4],
    })
  })
})

describe('against the decision model', () => {
  test('the table defaults to the model when one can answer, and its pick lands after the person’s drop', async () => {
    const model = decider(() => '4')
    await using t = await service(model.host)
    expect((await t.games.read(CHAT)).opponent).toBe('decision')

    // The request does not wait for the model: the person's chip is back with the model thinking.
    const moved = await t.games.personDrop(CHAT, 0)
    expect(moved.board[35]).toBe('you')
    expect(moved.waiting).toMatchObject({ status: 'thinking' })

    await t.games.settled()
    const game = await t.games.read(CHAT)
    expect(game.board[38]).toBe('agent')
    expect(game.turn).toBe('you')
    expect(game.waiting).toBeNull()
    expect(t.woke).toEqual([])
    expect(model.asked).toEqual(['s1'])
  })

  test('a miss leaves the move owed with the reason, and asking again retries', async () => {
    let answer: string | DecisionOutcome = { status: 'unavailable', ms: 1 }
    await using t = await service(decider(() => answer).host)
    await t.games.personDrop(CHAT, 0)
    await t.games.settled()
    const missed = await t.games.read(CHAT)
    expect(missed.turn).toBe('agent')
    expect(missed.waiting?.status).toBe('unreachable')

    answer = '2'
    await t.games.remind(CHAT)
    await t.games.settled()
    const retried = await t.games.read(CHAT)
    expect(retried.board[36]).toBe('agent')
    expect(retried.waiting).toBeNull()
  })

  test('the agent is refused while the model holds its side', async () => {
    await using t = await service(decider(() => '4').host)
    await t.games.personDrop(CHAT, 0)
    await t.games.settled()
    await expect(t.games.agentDrop(CHAT, 2)).rejects.toThrow('The decision model plays your side')
  })

  test('switching to the agent hands it the move that is owed, with a wake', async () => {
    await using t = await service(decider(() => ({ status: 'unavailable', ms: 1 })).host)
    await t.games.personDrop(CHAT, 0)
    await t.games.settled()
    expect(t.woke).toEqual([])

    const handed = await t.games.setOpponent(CHAT, 'agent')
    expect(handed.opponent).toBe('agent')
    expect(handed.waiting?.status).toBe('thinking')
    expect(t.woke).toHaveLength(1)
  })
})
