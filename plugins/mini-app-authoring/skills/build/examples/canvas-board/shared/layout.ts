import type { Link, Note } from './model'

/**
 * WHERE NOTES GO — the board's geometry, pure so the agent's "arrange" tool and the screen's
 * "add a note" agree on it. Board units are the canvas's own (pixels at 100% zoom).
 */

/** A note's card is this wide; its height grows with its text, so the grid allows for a tall one. */
export const NOTE_WIDTH = 208
export const NOTE_HEIGHT = 96
const GAP = 40
const STEP_X = NOTE_WIDTH + GAP
const STEP_Y = NOTE_HEIGHT + GAP
const COLUMNS = 4

export interface Place {
  id: string
  x: number
  y: number
}

/** Whether a card put at (x, y) would sit on top of an existing one. */
function overlaps(notes: readonly Note[], x: number, y: number): boolean {
  return notes.some(
    (note) => Math.abs(note.x - x) < NOTE_WIDTH && Math.abs(note.y - y) < NOTE_HEIGHT,
  )
}

/** The first empty slot of the grid, reading left to right, top to bottom. */
export function freeSpot(notes: readonly Note[]): { x: number; y: number } {
  for (let index = 0; ; index++) {
    const x = (index % COLUMNS) * STEP_X
    const y = Math.floor(index / COLUMNS) * STEP_Y
    if (!overlaps(notes, x, y)) return { x, y }
  }
}

export const ARRANGEMENTS = ['grid', 'layers'] as const
export type Arrangement = (typeof ARRANGEMENTS)[number]

/**
 * How far each note is from the start of its chain: a note nothing points at is layer 0, and every
 * other is one past its deepest source. A cycle must not loop forever, so a note is only ever
 * pushed to a layer below the number of notes.
 */
export function layersOf(notes: readonly Note[], links: readonly Link[]): Map<string, number> {
  const layer = new Map(notes.map((note) => [note.id, 0]))
  const edges = links.filter((link) => layer.has(link.from) && layer.has(link.to))
  for (let pass = 0; pass < notes.length; pass++) {
    let moved = false
    for (const { from, to } of edges) {
      const next = layer.get(from)! + 1
      if (next > layer.get(to)! && next < notes.length) {
        layer.set(to, next)
        moved = true
      }
    }
    if (!moved) break
  }
  return layer
}

/**
 * The positions an arrangement gives: `grid` fills rows in the order the notes were made;
 * `layers` puts the start of every chain on the left and follows the arrows to the right, one
 * column per step, so a flow reads as a flow.
 */
export function arrange(notes: readonly Note[], links: readonly Link[], how: Arrangement): Place[] {
  if (how === 'grid') {
    return notes.map((note, index) => ({
      id: note.id,
      x: (index % COLUMNS) * STEP_X,
      y: Math.floor(index / COLUMNS) * STEP_Y,
    }))
  }
  const layer = layersOf(notes, links)
  const rows = new Map<number, number>()
  return notes.map((note) => {
    const column = layer.get(note.id) ?? 0
    const row = rows.get(column) ?? 0
    rows.set(column, row + 1)
    return { id: note.id, x: column * STEP_X, y: row * STEP_Y }
  })
}
