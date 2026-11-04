import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'

import { COLUMNS, ROWS, landingRow, type Game } from '../shared/game'
import { Confetti } from './Confetti'
import './board.css'
import './ending.css'

/**
 * The board: seven columns of six cells, the chips in them, and how a game ends. Its whole look is
 * `board.css`; this file decides WHAT is drawn and WHICH state each piece is in (`data-*`), and
 * the stylesheet decides what that looks like. Keeping the two apart is what lets the motion be
 * switched off in one place for people who ask for less of it.
 *
 * A column is ONE button: the whole strip drops a chip, and the chip's landing cell previews on
 * hover and keyboard focus. Every column stays focusable, because a full or unavailable one is
 * `aria-disabled`, not `disabled`: arrow keys walk the columns, and a walk that skipped some would
 * land somewhere nobody expects.
 */

/**
 * The chips that are NEW since the board last drew, by cell, in the order played. Only these are
 * animated: opening a game in progress shows it at rest, while a move made as you watch drops in.
 * Kept until the next move, so a re-render mid-animation (the clock, a poll) does not cut it off.
 */
function useArrivals(game: Game): Map<number, number> {
  const count = game.moves.length
  // State adjusted while rendering: the first sight of a game has no arrivals.
  const [seen, setSeen] = useState<{ id: string; count: number; arrivals: Map<number, number> }>({
    id: game.id,
    count,
    arrivals: new Map(),
  })
  if (seen.id === game.id && seen.count === count) return seen.arrivals
  const since = seen.id === game.id ? seen.count : 0
  const arrivals = new Map(
    game.moves.slice(since).map((move, order) => [move.row * COLUMNS + move.column, order]),
  )
  setSeen({ id: game.id, count, arrivals })
  return arrivals
}

/** The centre of a cell in the 7 × 6 coordinates of the SVG laid over the grid. */
const centre = (cell: number) => ({
  x: (cell % COLUMNS) + 0.5,
  y: Math.floor(cell / COLUMNS) + 0.5,
})

export function Board({
  game,
  playable,
  onDrop,
  children,
}: {
  game: Game
  /** Whether the person may drop now: their turn, and no answer is on its way. */
  playable: boolean
  onDrop: (column: number) => void
  /** Laid over the board: the result card, or what stopped the game. */
  children?: ReactNode
}) {
  const arrivals = useArrivals(game)
  const columns = useRef<(HTMLButtonElement | null)[]>([])
  const ended = game.status !== 'playing'
  // The end happened in front of the person: play it. Reopened later, it is shown at rest.
  const fresh = ended && arrivals.size > 0
  const winner = game.line ? game.board[game.line[0]!] : null
  const last = game.moves.at(-1)
  const lastCell = last ? last.row * COLUMNS + last.column : -1

  const walk = (event: KeyboardEvent, column: number) => {
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (step === 0 || column + step < 0 || column + step >= COLUMNS) return
    event.preventDefault()
    columns.current[column + step]?.focus()
  }

  return (
    <div
      role="group"
      aria-label="Board"
      className="example-game-board"
      data-draw={game.status === 'draw' ? (fresh ? 'fresh' : 'rest') : undefined}
      style={{ '--example-game-end': Math.max(0, arrivals.size - 1) } as CSSProperties}
    >
      <div className="example-game-grid">
        {Array.from({ length: COLUMNS }, (_, column) => {
          const landing = landingRow(game.board, column)
          const open = playable && landing >= 0
          return (
            // mini-app: native-control — a column is one hit area spanning six cells, not a labelled button
            <button
              key={column}
              type="button"
              ref={(element) => {
                columns.current[column] = element
              }}
              aria-label={`Column ${column + 1}, ${landing < 0 ? 'full' : `${landing + 1} free`}`}
              aria-disabled={!open}
              className="example-game-column"
              onClick={() => open && onDrop(column)}
              onKeyDown={(event) => walk(event, column)}
            >
              {Array.from({ length: ROWS }, (_, row) => {
                const cell = row * COLUMNS + column
                const by = game.board[cell]
                const onLine = game.line?.includes(cell) ?? false
                return (
                  <span key={row} className="example-game-hole">
                    {by ? (
                      <span
                        className="example-game-chip"
                        data-by={by}
                        data-last={cell === lastCell}
                        data-fresh={arrivals.has(cell) || undefined}
                        data-win={onLine && fresh ? 'fresh' : undefined}
                        data-dim={ended && game.status !== 'draw' && !onLine ? true : undefined}
                        style={
                          {
                            '--example-game-row': row,
                            '--example-game-order': arrivals.get(cell) ?? 0,
                            '--example-game-win-order': game.line?.indexOf(cell) ?? 0,
                          } as CSSProperties
                        }
                      />
                    ) : (
                      open && row === landing && <span className="example-game-ghost" />
                    )}
                  </span>
                )
              })}
            </button>
          )
        })}
        {game.line && winner && (
          <svg
            viewBox={`0 0 ${COLUMNS} ${ROWS}`}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full"
          >
            <line
              {...endpoints(game.line)}
              pathLength={100}
              className="example-game-line"
              data-by={winner}
              data-fresh={fresh || undefined}
            />
          </svg>
        )}
      </div>
      {fresh && game.status === 'won' && <Confetti />}
      {children}
    </div>
  )
}

/** The winning run as one line through the middles of its end cells. */
function endpoints(line: readonly number[]) {
  const a = centre(line[0]!)
  const b = centre(line[line.length - 1]!)
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
}
