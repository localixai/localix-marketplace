import { describe, expect, test } from 'bun:test'
import { countOf, describeForAgent, requestInputSchema, type SavedRequest } from './model'

const saved = (id: string, createdAt: string): SavedRequest => ({
  id,
  name: `Request ${id}`,
  method: 'GET',
  url: `https://example.com/${id}`,
  headers: [],
  body: '',
  createdAt,
})

describe('the model', () => {
  test('counts read as words', () => {
    expect([countOf(1), countOf(3)]).toEqual(['1 request', '3 requests'])
  })

  test('the agent is told the count and every id, newest first', () => {
    const told = describeForAgent([
      saved('a', '2026-11-01T09:00:00.000Z'),
      saved('b', '2026-11-02T09:00:00.000Z'),
    ])
    expect(told.split('\n')).toEqual([
      '2 requests saved in this chat.',
      '- Request b: GET https://example.com/b (id b)',
      '- Request a: GET https://example.com/a (id a)',
    ])
  })

  test('the input schema applies no defaults, so a partial update cannot reset a field', () => {
    expect(requestInputSchema.partial().parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' })
  })
})
