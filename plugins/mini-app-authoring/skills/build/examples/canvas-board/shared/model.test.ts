import { describe, expect, test } from 'bun:test'
import { countOf, describeBoard, liveLinks, noteInputSchema, type Link, type Note } from './model'

const note = (id: string, text: string): Note => ({ id, text, x: 0.4, y: 96, tone: 'info' })
const link = (id: string, from: string, to: string, label = ''): Link => ({
  id,
  from,
  to,
  label,
  tone: 'neutral',
})

describe('the model', () => {
  test('counts read as words', () => {
    expect(countOf(1, 'note')).toBe('1 note')
    expect(countOf(2, 'link')).toBe('2 links')
  })

  test('a link to a removed note is not shown or counted', () => {
    const notes = [note('a', 'A'), note('b', 'B')]
    const links = [link('l1', 'a', 'b'), link('l2', 'a', 'gone')]
    expect(liveLinks(notes, links).map((each) => each.id)).toEqual(['l1'])
    expect(describeBoard(notes, links)).toContain('2 notes, 1 link.')
  })

  test('the agent is told each note with its id and each link in words', () => {
    const text = describeBoard(
      [note('a', 'Plan'), note('b', 'Risk')],
      [link('l1', 'a', 'b', 'blocks')],
    )
    expect(text).toContain('- Plan (id a, info, at 0,96)')
    expect(text).toContain('- Plan -> Risk [blocks] (id l1)')
    expect(describeBoard([], [])).toBe('The board is empty.')
  })

  test('a partial change keeps what it does not name (no defaults in the input)', () => {
    expect(noteInputSchema.partial().parse({ x: 5 })).toEqual({ x: 5 })
    expect(noteInputSchema.safeParse({ text: '   ' }).success).toBe(false)
  })
})
