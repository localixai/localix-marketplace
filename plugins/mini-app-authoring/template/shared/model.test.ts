import { describe, expect, test } from 'bun:test'
import { countOf, describeForAgent, itemInputSchema, sortItems, type Item } from './model'

const item = (id: string, done: boolean, createdAt: string): Item => ({
  id,
  title: `Item ${id}`,
  note: '',
  done,
  createdAt,
})

describe('the model', () => {
  test('open items come first, newest first within each group', () => {
    const items = [
      item('old-open', false, '2026-11-01T09:00:00.000Z'),
      item('done', true, '2026-11-03T09:00:00.000Z'),
      item('new-open', false, '2026-11-02T09:00:00.000Z'),
    ]
    expect(sortItems(items).map((each) => each.id)).toEqual(['new-open', 'old-open', 'done'])
  })

  test('counts read as words', () => {
    expect(countOf(1, 'item')).toBe('1 item')
    expect(countOf(0, 'item')).toBe('0 items')
    expect(countOf(3, 'item')).toBe('3 items')
  })

  test('the agent is told every item with its id and whether it is done', () => {
    expect(describeForAgent([])).toBe('The list is empty.')
    const text = describeForAgent([item('a', true, '2026-11-01T09:00:00.000Z')])
    expect(text).toBe('1 item, 0 open.\n- [x] Item a (id a)')
  })

  test('an input fills no defaults, so a partial change never resets a field', () => {
    expect(itemInputSchema.partial().parse({ done: true })).toEqual({ done: true })
  })
})
