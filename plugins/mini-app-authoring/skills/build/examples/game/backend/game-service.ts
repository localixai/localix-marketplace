import { randomUUID } from 'node:crypto'
import { createTurnTable, type ChatRef, type TurnTableHosts } from '@localixai/mini-app-sdk/backend'

import {
  APP,
  MoveRefused,
  dropChip,
  newGame,
  other,
  owesAgentMove,
  gameSchema,
} from '../shared/game'
import type { Game, Player } from '../shared/game'
import { ANSWER_TOOLS, askDecision, askForMove, positionKey } from './ask'

/**
 * THE GAME AT EACH CHAT'S TABLE, and every way it changes.
 *
 * One board per chat, kept in that chat's own folder and deleted with it. The turn-taking is the
 * SDK's `createTurnTable`, the same for every game against the agent: who is asked for the move
 * that is owed (once per position), how the decision model's answer lands, and what the agent is
 * refused while the model holds its side. What is Connect Four's own is here: what a move is, and
 * who opens the next game.
 *
 * The person's own move is written and returned first, so the board shows it at once; the other
 * side's move arrives later through the store feed.
 */
export function createGameService(
  hosts: TurnTableHosts & { now?: () => string; newId?: () => string },
) {
  const { now = () => new Date().toISOString(), newId = () => randomUUID(), ...tableHosts } = hosts
  const table = createTurnTable({
    ...tableHosts,
    miniApp: APP,
    noun: 'board',
    now,
    schema: gameSchema,
    initial: () => newGame({ id: newId(), first: 'you', now: now() }),
    owes: owesAgentMove,
    key: positionKey,
    live: (game: Game) => game.status === 'playing',
    agentTurn: (game) => ({ message: askForMove(game), tools: ANSWER_TOOLS }),
    askDecision,
    playDecision: (game, answer: { column: number }, at) =>
      dropChip(game, answer.column, 'agent', at),
    refuse: (message) => new MoveRefused(message),
  })

  /** The next game at this table: the score and the opponent carry over, the other side opens. */
  const nextGame = (game: Game, at: string, first: Player = other(game.first)) =>
    newGame({ id: newId(), first, now: at, record: game.record, opponent: game.opponent })

  return {
    /** Resolves once the decision model's turns so far have landed. For tests. */
    settled: table.settled,
    read: table.read,

    // What a person does in the view. Each asks the other side for the move it then owes.
    personDrop: (chat: ChatRef, column: number) =>
      table.personTurn(chat, (game, at) => dropChip(game, column, 'you', at)),
    newGame: (chat: ChatRef, first?: Player) =>
      table.personTurn(chat, (game, at) => nextGame(game, at, first)),
    remind: table.remind,
    setOpponent: table.setOpponent,

    // What the agent does through its tool. None of it wakes anyone: the agent is the turn.
    /** `answered` says the drop answered the board's own question rather than a chat request. */
    agentDrop: (chat: ChatRef, column: number) =>
      table.agentTurn(chat, (game, at) => dropChip(game, column, 'agent', at)),
    /** Against the decision model the person opens: a tool call never asks that model. */
    agentNewGame: (chat: ChatRef, first: Player) =>
      table.update(chat, (game, at) =>
        nextGame(game, at, game.opponent === 'decision' ? 'you' : first),
      ),
  }
}

export type GameService = ReturnType<typeof createGameService>
