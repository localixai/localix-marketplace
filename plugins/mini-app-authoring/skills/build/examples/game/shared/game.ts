import { agentWaitSchema, type AgentWait } from '@localixai/mini-app-sdk/agent-wait'
import { OPPONENTS, opponentSchema, type Opponent } from '@localixai/mini-app-sdk/opponent'
import { z } from 'zod'

/**
 * THE RULES — Connect Four, pure. The backend, the agent's tool and the screen all import this one
 * file, so none of them can disagree about where a chip lands or who has won. No storage, no
 * clock, no React: every rule is tested in milliseconds (`game.test.ts`).
 *
 * The person plays `you`, the other side plays `agent`: the agent in the chat, or the decision
 * model the person picked (`opponent`). The side is the same either way.
 *
 * The board is 6 rows by 7 columns, stored row by row from the TOP: cell `row * 7 + column`.
 * Columns are 0–6 here and numbered 1–7 wherever a person or the agent reads them.
 */

export const APP = 'example-game'
export const COLUMNS = 7
export const ROWS = 6
/** Chips in a row that win. */
export const RUN = 4

export const PLAYERS = ['you', 'agent'] as const
export type Player = (typeof PLAYERS)[number]
export type Cell = Player | null

export { OPPONENTS, type AgentWait, type Opponent }

const column = z
  .number()
  .int()
  .min(0)
  .max(COLUMNS - 1)

export const moveSchema = z.object({
  column,
  row: z
    .number()
    .int()
    .min(0)
    .max(ROWS - 1),
  by: z.enum(PLAYERS),
  at: z.string(),
})
export type Move = z.infer<typeof moveSchema>

/** The score at this table from the person's side; it carries from one game to the next. */
export const recordSchema = z.object({
  won: z.number().int().min(0),
  lost: z.number().int().min(0),
  draw: z.number().int().min(0),
})
export type GameRecord = z.infer<typeof recordSchema>

/** The one game at this table: what the backend keeps and every route answers with. */
export const gameSchema = z.object({
  id: z.string().min(1),
  board: z.array(z.enum(PLAYERS).nullable()).length(COLUMNS * ROWS),
  /** Whose move it is; kept after the end, where nothing reads it. */
  turn: z.enum(PLAYERS),
  /** Who opened this game: the next one is opened by the other side. */
  first: z.enum(PLAYERS),
  /** From the person's side. */
  status: z.enum(['playing', 'won', 'lost', 'draw']),
  /** The four cells of the winning run, in order. */
  line: z.array(z.number().int()).length(RUN).nullable(),
  moves: z.array(moveSchema).max(COLUMNS * ROWS),
  /** While the other side owes a move: when it was asked and whether it can answer. */
  waiting: agentWaitSchema.nullable(),
  record: recordSchema,
  /** Who plays the other side; null until the table settles it (the backend does, on first read). */
  opponent: opponentSchema,
  startedAt: z.string(),
})
export type Game = z.infer<typeof gameSchema>

/** A move the rules refuse, in a sentence the person or the agent can act on. */
export class MoveRefused extends Error {
  override name = 'MoveRefused'
}

export const EMPTY_RECORD: GameRecord = { won: 0, lost: 0, draw: 0 }

export function newGame(input: {
  id: string
  first: Player
  now: string
  record?: GameRecord
  opponent?: Opponent | null
}): Game {
  return {
    id: input.id,
    board: Array.from({ length: COLUMNS * ROWS }, () => null),
    turn: input.first,
    first: input.first,
    status: 'playing',
    line: null,
    moves: [],
    waiting: null,
    record: input.record ?? EMPTY_RECORD,
    opponent: input.opponent ?? null,
    startedAt: input.now,
  }
}

export const other = (by: Player): Player => (by === 'you' ? 'agent' : 'you')

/** Whether the other side owes a move now. */
export const owesAgentMove = (game: Pick<Game, 'status' | 'turn'> | null): boolean =>
  game?.status === 'playing' && game.turn === 'agent'

/** The row a chip dropped into `col` comes to rest in, or -1 when the column is full. */
export function landingRow(board: readonly Cell[], col: number): number {
  for (let row = ROWS - 1; row >= 0; row--) if (board[row * COLUMNS + col] === null) return row
  return -1
}

/** The columns a chip can still be dropped into. */
export const openColumns = (board: readonly Cell[]): number[] =>
  Array.from({ length: COLUMNS }, (_, col) => col).filter((col) => landingRow(board, col) >= 0)

/** Right, down, and both diagonals: each run is found once, from its first cell. */
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const

/** The first four-in-a-row on the board, if any: who has it and its cells. */
export function winnerOf(board: readonly Cell[]): { by: Player; line: number[] } | null {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      const by = board[row * COLUMNS + col]
      if (!by) continue
      for (const [dr, dc] of DIRECTIONS) {
        const line = Array.from({ length: RUN }, (_, step) => [row + dr * step, col + dc * step])
        const inside = line.every(([r, c]) => r! >= 0 && r! < ROWS && c! >= 0 && c! < COLUMNS)
        if (inside && line.every(([r, c]) => board[r! * COLUMNS + c!] === by))
          return { by, line: line.map(([r, c]) => r! * COLUMNS + c!) }
      }
    }
  }
  return null
}

/** `board` with a chip of `by` dropped into `col`; null when the column is full. */
export function withChip(board: readonly Cell[], col: number, by: Player): Cell[] | null {
  const row = landingRow(board, col)
  if (row < 0) return null
  return board.map((cell, index) => (index === row * COLUMNS + col ? by : cell))
}

/** The columns where a chip of `by` would win at once. Code sees this for certain. */
export const winningColumns = (board: readonly Cell[], by: Player): number[] =>
  openColumns(board).filter((col) => winnerOf(withChip(board, col, by)!)?.by === by)

/** The score after a game that ended `status`. */
export const scored = (record: GameRecord, status: Game['status']): GameRecord =>
  status === 'playing' ? record : { ...record, [status]: record[status] + 1 }

/** The game after one chip, or a {@link MoveRefused} saying why there is none. */
export function dropChip(game: Game, col: number, by: Player, now: string): Game {
  if (game.status !== 'playing') throw new MoveRefused('This game is over. Start a new one.')
  if (game.turn !== by)
    throw new MoveRefused(
      by === 'agent'
        ? 'It is the user’s turn. The board wakes you when they have moved.'
        : 'Wait for the other side’s move.',
    )
  if (!Number.isInteger(col) || col < 0 || col >= COLUMNS)
    throw new MoveRefused(`Choose a column from 1 to ${COLUMNS}.`)
  const board = withChip(game.board, col, by)
  if (!board) throw new MoveRefused(`Column ${col + 1} is full.`)
  const won = winnerOf(board)
  const full = openColumns(board).length === 0
  const status = won ? (won.by === 'you' ? 'won' : 'lost') : full ? 'draw' : 'playing'
  return {
    ...game,
    board,
    turn: other(by),
    status,
    line: won?.line ?? null,
    moves: [...game.moves, { column: col, row: landingRow(game.board, col), by, at: now }],
    // A move by the other side answers whatever it was asked.
    waiting: by === 'agent' ? null : game.waiting,
    record: scored(game.record, status),
  }
}
