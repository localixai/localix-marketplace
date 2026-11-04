import {
  COLUMNS,
  RUN,
  openColumns,
  winningColumns,
  type Cell,
  type Game,
  type GameRecord,
  type Move,
} from './game'

/**
 * THE GAME AS TEXT for the agent: tool results, the wake that asks for its move, and the context
 * the screen publishes. One module, so all three describe the same position in the same words.
 *
 * Written from the agent's side. It plays O and the user plays X, unless the table's opponent is
 * the decision model: that model then plays O and the agent only watches.
 */

/** Who the other side is, from the agent's side. */
const oSide = (game: Pick<Game, 'opponent'>) =>
  game.opponent === 'decision'
    ? { who: 'The decision model', whose: 'The decision model’s' }
    : { who: 'You', whose: 'Your' }

const MARK: Record<NonNullable<Cell>, string> = { you: 'X', agent: 'O' }

/** The board as a grid: X the user, O the agent, `.` empty, with the column numbers on top. */
export function drawBoard(game: Pick<Game, 'board'>): string {
  const numbers = Array.from({ length: COLUMNS }, (_, col) => col + 1).join(' ')
  const rows = Array.from({ length: game.board.length / COLUMNS }, (_, row) =>
    game.board
      .slice(row * COLUMNS, (row + 1) * COLUMNS)
      .map((cell) => (cell ? MARK[cell] : '.'))
      .join(' '),
  )
  return [numbers, ...rows].join('\n')
}

/** "columns 2, 5", "column 4": a list of columns the way a person numbers them. */
export function columnList(columns: readonly number[]): string {
  const numbers = columns.map((col) => col + 1).join(', ')
  return columns.length === 1 ? `column ${numbers}` : `columns ${numbers}`
}

/** One sentence: who moves next, or how the game ended. */
export function statusLine(game: Game): string {
  if (game.status === 'won') return 'The user won with four in a row.'
  if (game.status === 'lost') return `${oSide(game).who} won with four in a row.`
  if (game.status === 'draw') return 'Draw: the board is full.'
  return game.turn === 'you' ? 'The user’s turn (X).' : `${oSide(game).whose} turn (O).`
}

/** The last move as a sentence: "The user dropped X into column 4." */
export function lastMoveLine(game: Game): string | null {
  const move: Move | undefined = game.moves.at(-1)
  if (!move) return null
  const who = move.by === 'you' ? 'The user' : oSide(game).who
  return `${who} dropped ${MARK[move.by]} into column ${move.column + 1}.`
}

/** The table's score from the agent's side, or null before the first game ends. */
export function recordLine(record: GameRecord): string | null {
  if (record.won + record.lost + record.draw === 0) return null
  return `Score at this table: the user ${record.won}, O ${record.lost}, draws ${record.draw}.`
}

/**
 * What code can see for certain, said before the agent thinks: where O wins now and where X would.
 * The agent weighs a fact instead of working it out, and still chooses.
 */
export function threatLine(game: Game): string | null {
  if (game.status !== 'playing') return null
  const mine = winningColumns(game.board, 'agent')
  const theirs = winningColumns(game.board, 'you')
  if (mine.length) return `You win now by dropping into ${columnList(mine)}.`
  if (theirs.length) return `The user wins next in ${columnList(theirs)}: block it.`
  return null
}

/** The whole game for the agent, as the `state` action and the screen's context show it. */
export function describeGame(game: Game): string {
  return [
    `Connect Four: the user is X (red), ${game.opponent === 'decision' ? 'the decision model plays' : 'you play'} O (amber). Four in a row (${RUN}) wins.`,
    statusLine(game),
    lastMoveLine(game),
    '',
    drawBoard(game),
    '',
    game.status === 'playing' ? `Open: ${columnList(openColumns(game.board))}.` : null,
    threatLine(game),
    recordLine(game.record),
  ]
    .filter((line) => line !== null)
    .join('\n')
}
