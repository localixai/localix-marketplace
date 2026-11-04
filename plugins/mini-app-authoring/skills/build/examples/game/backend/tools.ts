import {
  classifyByAction,
  type ChatRef,
  type MiniAppContext,
} from '@localixai/mini-app-sdk/backend'

import { describeGame, drawBoard, lastMoveLine, recordLine, statusLine } from '../shared/describe'
import { COLUMNS, MoveRefused, type Game } from '../shared/game'
import { gameUri } from '../shared/resource'
import type { GameService } from './game-service'

/**
 * Reading the board is a read; every other action changes only this chat's game, which is deleted
 * with the chat: `session`. Without a classifier the tool's `mutates: true` reads as `external`,
 * and a read-only plan session would refuse even `state`.
 */
export const classifyGameCall = classifyByAction({
  state: { effect: 'read' },
  drop: { effect: 'session' },
  new_game: { effect: 'session' },
})

/** What the agent says when a game ends. Short: the board already shows how. */
const GAME_OVER_ASK =
  'The game is over. Tell the user the result in one short line and offer another.'

/** The table a call acts on: the chat the call RUNS in, which the host names in its context. */
function chatOf(ctx: MiniAppContext, context: { session?: { id: string } } | undefined): ChatRef {
  const sessionId = context?.session?.id
  if (!sessionId) throw new MoveRefused('Connect Four is played in a chat; this call has none.')
  return { userId: ctx.userId, sessionId }
}

/** What follows a move: what happened, the board, and what is expected next. */
function afterDrop(game: Game): string {
  const next =
    game.status === 'playing'
      ? 'The board wakes you when the user has moved.'
      : [GAME_OVER_ASK, recordLine(game.record)].filter(Boolean).join(' ')
  return [[lastMoveLine(game), statusLine(game)].join(' '), '', drawBoard(game), '', next].join(
    '\n',
  )
}

/**
 * The agent's side of the game: ONE tool, `example_game`, whose `action` says what it does. One
 * tool rather than three because every tool's schema rides in every request of every run the app
 * is loaded for. Every action acts on the board of the chat the call runs in, so an agent in one
 * chat can never touch another chat's board.
 *
 * Two rules from `docs/extending/mini-apps.md#results-a-tool-reports`:
 * - `isError: true` only when nothing was done: a refused drop shows the board as it now is;
 * - a drop that answers the board's wake ENDS the turn (`terminate`) while the game goes on: the
 *   board shows the move, and a chat line repeating it would be a second model call per move.
 */
export function createGameTools(ctx: MiniAppContext, games: GameService) {
  const { z } = ctx
  return [
    ctx.defineTool({
      name: 'example_game',
      label: 'Connect Four',
      activeVerb: 'Playing Connect Four',
      description:
        'Play Connect Four with the user on this chat’s board; you are O. "drop" puts your chip in a column, "state" reads the board, "new_game" starts a game.',
      inputSchema: z.object({
        action: z.enum(['drop', 'state', 'new_game']).describe('What to do on this chat’s board.'),
        column: z
          .number()
          .int()
          .min(1)
          .max(COLUMNS)
          .optional()
          .describe('For "drop": the column, 1 (left) to 7 (right).'),
        first: z
          .enum(['user', 'agent'])
          .optional()
          .describe('For "new_game": who moves first (default the user).'),
      }),
      executionMode: 'sequential',
      mutates: true,
      classify: classifyGameCall,
      permissionPaths: () => [],
      async execute(_toolCallId, input, _signal, _onUpdate, context) {
        let chat: ChatRef | null = null
        try {
          chat = chatOf(ctx, context)
          if (input.action === 'state') return { content: describeGame(await games.read(chat)) }
          if (input.action === 'new_game') {
            const game = await games.agentNewGame(chat, input.first === 'agent' ? 'agent' : 'you')
            return {
              content: [
                'A new game is on this chat’s board.',
                game.opponent === 'decision'
                  ? 'The decision model plays O at this table, so the user moves first and you do not move.'
                  : game.turn === 'agent'
                    ? 'You move first: call example_game with action "drop" now.'
                    : 'The user moves first; the board wakes you after their move.',
                '',
                drawBoard(game),
              ].join('\n'),
              // The view the person opens from the transcript, in THIS chat even if they switch.
              details: ctx.ui.offer({
                uri: gameUri(chat.sessionId),
                label: 'Open Connect Four',
                description: 'This chat’s board',
              }),
            }
          }
          if (input.column === undefined) throw new MoveRefused('Name the column: 1 to 7.')
          const { game, answered } = await games.agentDrop(chat, input.column - 1)
          const ends = answered && game.status === 'playing'
          return { content: afterDrop(game), ...(ends ? { terminate: true } : {}) }
        } catch (error) {
          if (!(error instanceof MoveRefused)) throw error
          const board = chat ? `\n\n${describeGame(await games.read(chat))}` : ''
          return { content: `${error.message}${board}`, isError: true }
        }
      },
    }),
  ]
}
