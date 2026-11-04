import { describe, expect, test } from 'bun:test'
import { columnList, describeGame, drawBoard, threatLine } from './describe'
import {
  COLUMNS,
  MoveRefused,
  dropChip,
  landingRow,
  newGame,
  openColumns,
  winnerOf,
  winningColumns,
  type Game,
  type Player,
} from './game'

const AT = '2026-11-03T10:00:00.000Z'

/** Columns (0-based) of a whole game that fills the board without a four. */
// prettier-ignore
const DRAW = [2,3,1,2,2,0,4,0,0,0,6,0,3,1,6,3,6,6,5,0,2,6,1,2,3,3,2,5,5,4,6,4,4,5,4,1,4,5,1,5,1,3]

/** Play a sequence of columns (0-based), the two sides alternating from `first`. */
function play(columns: number[], first: Player = 'you'): Game {
  let game = newGame({ id: 'g', first, now: AT })
  for (const column of columns) game = dropChip(game, column, game.turn, AT)
  return game
}

describe('where a chip lands', () => {
  test('it falls to the lowest free row and a full column refuses it', () => {
    const game = play([3, 3, 3])
    expect(landingRow(game.board, 3)).toBe(2)
    expect(game.moves.map(({ row }) => row)).toEqual([5, 4, 3])
    const full = play([0, 0, 0, 0, 0, 0])
    expect(landingRow(full.board, 0)).toBe(-1)
    expect(openColumns(full.board)).toEqual([1, 2, 3, 4, 5, 6])
    expect(() => dropChip(full, 0, full.turn, AT)).toThrow('Column 1 is full.')
  })

  test('the sides alternate, and the side that is not to move is refused with the reason', () => {
    const game = play([3])
    expect(game.turn).toBe('agent')
    expect(() => dropChip(game, 4, 'you', AT)).toThrow(MoveRefused)
    expect(() => dropChip(game, 4, 'you', AT)).toThrow('Wait for the other side')
    expect(() => dropChip(play([]), 4, 'agent', AT)).toThrow('It is the user’s turn')
    expect(() => dropChip(game, COLUMNS, 'agent', AT)).toThrow('Choose a column from 1 to 7.')
  })
})

describe('how a game ends', () => {
  test('four in a row wins, in every direction', () => {
    // you: 0 0 0 0 (a column); the agent answers in column 1
    expect(winnerOf(play([0, 1, 0, 1, 0, 1, 0]).board)?.line).toEqual([14, 21, 28, 35])
    // you: 0 1 2 3 along the floor
    expect(winnerOf(play([0, 0, 1, 1, 2, 2, 3]).board)?.line).toEqual([35, 36, 37, 38])
    // a diagonal for you, from the floor of column 1 up to the third row of column 4
    const rising = play([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3])
    expect(winnerOf(rising.board)).toEqual({ by: 'you', line: [17, 23, 29, 35] })
  })

  test('the winner is scored from the person’s side and the game stops taking chips', () => {
    const won = play([0, 1, 0, 1, 0, 1, 0])
    expect(won.status).toBe('won')
    expect(won.record).toEqual({ won: 1, lost: 0, draw: 0 })
    expect(() => dropChip(won, 3, 'agent', AT)).toThrow('This game is over.')
    const lost = play([6, 0, 6, 0, 5, 0, 5, 0])
    expect(lost.status).toBe('lost')
    expect(lost.record.lost).toBe(1)
  })

  test('a full board with no run is a draw', () => {
    // A complete game found by search: all 42 chips played and nobody has four.
    const game = play(DRAW)
    expect(game.moves).toHaveLength(42)
    expect(winnerOf(game.board)).toBeNull()
    expect(game.status).toBe('draw')
    expect(game.record).toEqual({ won: 0, lost: 0, draw: 1 })
    expect(openColumns(game.board)).toEqual([])
  })
})

describe('what the agent is told', () => {
  test('code names the columns that win now, so the agent weighs a fact', () => {
    // you has three on the floor (0 1 2); the agent has played 6, 6.
    const game = play([0, 6, 1, 6, 2])
    expect(winningColumns(game.board, 'you')).toEqual([3])
    expect(threatLine(game)).toBe('The user wins next in column 4: block it.')
    expect(columnList([1, 4])).toBe('columns 2, 5')
  })

  test('the board is drawn with column numbers and X for the user, O for the agent', () => {
    const text = drawBoard(play([3, 3]))
    expect(text.split('\n')[0]).toBe('1 2 3 4 5 6 7')
    expect(text.split('\n').slice(-2)).toEqual(['. . . O . . .', '. . . X . . .'])
    expect(describeGame(play([3]))).toContain('The user dropped X into column 4.')
  })
})
