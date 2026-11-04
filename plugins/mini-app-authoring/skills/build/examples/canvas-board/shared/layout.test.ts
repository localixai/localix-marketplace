import { describe, expect, test } from 'bun:test'
import { arrange, freeSpot, layersOf, NOTE_WIDTH } from './layout'
import type { Link, Note } from './model'

const note = (id: string, x = 0, y = 0): Note => ({ id, text: id, x, y, tone: 'neutral' })
const link = (from: string, to: string): Link => ({
  id: `${from}${to}`,
  from,
  to,
  label: '',
  tone: 'neutral',
})

describe('layout', () => {
  test('a new note takes the first slot nothing sits on', () => {
    expect(freeSpot([])).toEqual({ x: 0, y: 0 })
    expect(freeSpot([note('a')])).toEqual({ x: 248, y: 0 })
    // A note dragged a little off its slot still blocks it.
    expect(freeSpot([note('a', NOTE_WIDTH - 10, 20)])).toEqual({ x: 248 * 2, y: 0 })
  })

  test('the grid fills four columns in creation order', () => {
    const notes = ['a', 'b', 'c', 'd', 'e'].map((id) => note(id))
    const places = arrange(notes, [], 'grid')
    expect(places.map((place) => [place.x / 248, place.y / 136])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [0, 1],
    ])
  })

  test('layers follow the arrows, and a cycle ends instead of looping', () => {
    const notes = [note('a'), note('b'), note('c')]
    expect(layersOf(notes, [link('a', 'b'), link('b', 'c')])).toEqual(
      new Map([
        ['a', 0],
        ['b', 1],
        ['c', 2],
      ]),
    )
    const cycle = layersOf(notes, [link('a', 'b'), link('b', 'a')])
    expect(Math.max(...cycle.values())).toBeLessThan(notes.length)
  })

  test('notes in one layer stack in rows', () => {
    const notes = [note('a'), note('b'), note('c')]
    const places = arrange(notes, [link('a', 'b'), link('a', 'c')], 'layers')
    expect(places.map((place) => [place.x, place.y])).toEqual([
      [0, 0],
      [248, 0],
      [248, 136],
    ])
  })
})
