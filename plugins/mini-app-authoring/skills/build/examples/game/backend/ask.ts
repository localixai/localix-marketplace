import {
  askDecisionForTurn,
  type ChatRef,
  type DecisionAsk,
  type DecisionHost,
} from '@localixai/mini-app-sdk/backend'

import { drawBoard, lastMoveLine, recordLine, threatLine, columnList } from '../shared/describe'
import {
  COLUMNS,
  openColumns,
  winningColumns,
  withChip,
  winnerOf,
  type AgentWait,
  type Cell,
  type Game,
} from '../shared/game'

/**
 * HOW THE BOARD ASKS FOR THE OTHER SIDE'S MOVE. Two askers, one position:
 *
 * - the AGENT is woken in the chat the board belongs to (`ctx.host.wake`, driven by the turn table)
 *   with the position and the one tool that answers it. Nothing waits for the answer: the board
 *   shows "thinking" and the move lands through the store feed when the tool is called;
 * - the DECISION MODEL is asked here, for a table whose opponent is `decision`: one `choice`
 *   question whose options are the open columns. No chat is woken; the spend is recorded against
 *   the chat the board belongs to.
 *
 * Both are told what code can see for certain (where a side wins now), so the model weighs a fact
 * instead of working it out. The choice stays the model's.
 */

/** The one tool a woken turn answers with. The host puts it on the wire before the turn starts. */
export const ANSWER_TOOLS = ['example_game']

/** One wake per position: a double click, a retry and a reminder for it are the same wake. */
export const positionKey = (game: Game) => `${game.id}:${game.moves.length}`

/**
 * The words the woken turn reads. No reply is asked for: the move itself ends the turn, because the
 * board already shows it, and a chat line repeating it would cost a model call per move.
 */
export function askForMove(game: Game): string {
  return [
    lastMoveLine(game)?.concat(' Your move as O.') ?? 'A new game: you move first, as O.',
    recordLine(game.record),
    '',
    drawBoard(game),
    '',
    threatLine(game),
    `Call example_game with action "drop" and a column: ${columnList(openColumns(game.board))}.`,
  ]
    .filter((line) => line !== null)
    .join('\n')
}

/** Columns where dropping an O would let X win with the chip placed right on top of it. */
function unsafeColumns(board: readonly Cell[]): number[] {
  return openColumns(board).filter((col) => {
    const after = withChip(board, col, 'agent')!
    const above = withChip(after, col, 'you')
    return !winnerOf(after) && above !== null && winnerOf(above)?.by === 'you'
  })
}

const number = (cols: readonly number[]) => cols.map((col) => col + 1)

/** The position from O's side and the one question: which open column. */
export function moveAsk(game: Game): DecisionAsk {
  const criteria = Object.fromEntries(
    openColumns(game.board).map((col) => [
      String(col + 1),
      col === 3 ? 'Column 4, the centre' : `Column ${col + 1}`,
    ]),
  )
  return {
    state: {
      game: `Connect Four on a ${COLUMNS}-column, 6-row board; four in a row, column or diagonal wins`,
      you_play: 'O',
      opponent_plays: 'X',
      board_columns_numbered_1_to_7_rows_top_to_bottom: drawBoard(game).split('\n'),
      open_columns: number(openColumns(game.board)),
      columns_where_o_wins_now: number(winningColumns(game.board, 'agent')),
      columns_where_x_wins_next: number(winningColumns(game.board, 'you')),
      columns_that_hand_x_a_win: number(unsafeColumns(game.board)),
    },
    questions: {
      move: {
        type: 'choice',
        instructions:
          'Which column is the best move for O? Take a column where O wins now; else block a column where X wins next; else avoid a column that hands X a win; else prefer the centre columns, which join the most lines.',
        criteria,
      },
    },
  }
}

/** The decision model's move: the column (0-based) to play, or the wait that says why there is none. */
export async function askDecision(
  decisions: DecisionHost | undefined,
  chat: ChatRef,
  game: Game,
  now: string,
): Promise<{ column: number } | { waiting: AgentWait }> {
  const turn = { ask: moveAsk(game), question: 'move', purpose: 'move' }
  const answered = await askDecisionForTurn(decisions, chat, turn, now)
  return 'answer' in answered ? { column: Number(answered.answer.choice) - 1 } : answered
}
