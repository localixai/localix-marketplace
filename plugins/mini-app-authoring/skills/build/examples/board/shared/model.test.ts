import { describe, expect, test } from 'bun:test'
import {
  cardInputSchema,
  cardsIn,
  columnTotals,
  describeForAgent,
  isOverdue,
  neighbour,
  type Card,
} from './model'

const card = (id: string, over: Partial<Card> = {}): Card => ({
  id,
  title: `Card ${id}`,
  note: '',
  assignee: '',
  points: null,
  due: null,
  stage: 'backlog',
  createdAt: `2026-11-0${id}T09:00:00.000Z`,
  ...over,
})

describe('the model', () => {
  test('a column lists its own cards, oldest first', () => {
    const cards = [card('3'), card('1'), card('2', { stage: 'doing' })]
    expect(cardsIn(cards, 'backlog').map((each) => each.id)).toEqual(['1', '3'])
  })

  test('a column total adds the points and counts a card without any as zero', () => {
    expect(columnTotals([card('1', { points: 3 }), card('2'), card('3', { points: 5 })])).toEqual({
      count: 3,
      points: 8,
    })
    expect(columnTotals([])).toEqual({ count: 0, points: 0 })
  })

  test('the neighbour stops at both ends of the flow', () => {
    expect(neighbour('backlog', -1)).toBeNull()
    expect(neighbour('backlog', 1)).toBe('doing')
    expect(neighbour('done', 1)).toBeNull()
  })

  test('only an unfinished card past its day is overdue', () => {
    const late = card('1', { due: '2026-11-01' })
    expect(isOverdue(late, '2026-11-03')).toBe(true)
    expect(isOverdue(late, '2026-11-01')).toBe(false)
    expect(isOverdue({ ...late, stage: 'done' }, '2026-11-03')).toBe(false)
    expect(isOverdue(card('2'), '2026-11-03')).toBe(false)
  })

  test('the input refuses a blank title and a bad day, and keeps a null that clears a field', () => {
    expect(cardInputSchema.safeParse({ title: '   ' }).success).toBe(false)
    expect(cardInputSchema.safeParse({ title: 'x', due: '2026-13-40' }).success).toBe(false)
    // A change sends only what it names, and `null` is how it clears a field.
    expect(cardInputSchema.partial().parse({ points: null })).toEqual({ points: null })
  })

  test('the agent is told every column, with ids, facts and totals', () => {
    const text = describeForAgent([
      card('1', { assignee: 'Maya', points: 3, due: '2026-11-09' }),
      card('2', { stage: 'review' }),
    ])
    expect(text).toContain('Backlog — 1 card, 3 pts')
    expect(text).toContain('- Card 1 (Maya, 3 pts, due 2026-11-09) [id 1]')
    expect(text).toContain('In progress — 0 cards, 0 pts')
    expect(text).toContain('Review — 1 card, 0 pts')
    expect(describeForAgent([])).toBe('The board is empty.')
  })
})
