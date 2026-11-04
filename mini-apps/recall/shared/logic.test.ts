import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { fromQuery, pathOf, toQuery, withMediaUrls } from './api'
import { addDays, studyDay } from './day'
import { countOf, formatInterval, formatMoment } from './format'
import { buildQueue, interleave } from './queue'
import { createScheduler, newCardState, rebuildCard } from './scheduler'
import { forecastSeries, heatmap, intervalFactor, streak } from './stats'

const MIN = 60_000
const DAY = 86_400_000

describe('the study day', () => {
  test('starts at the set hour in the local zone', () => {
    // 01:30 UTC is 04:30 in UTC+3: a new day. 00:30 UTC is 03:30 there: still the day before.
    expect(studyDay(new Date('2026-11-05T01:30:00Z'), 4, 180).key).toBe('2026-11-05')
    expect(studyDay(new Date('2026-11-05T00:30:00Z'), 4, 180).key).toBe('2026-11-04')
    const day = studyDay(new Date('2026-11-05T12:00:00Z'), 4, -300)
    expect(day.start.toISOString()).toBe('2026-11-05T09:00:00.000Z')
    expect(day.end.toISOString()).toBe('2026-11-06T09:00:00.000Z')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('words for values', () => {
  test('intervals read like button labels', () => {
    expect([30_000, 10 * MIN, 3 * 60 * MIN, 3 * DAY, 61 * DAY, 548 * DAY].map(formatInterval)).toEqual([
      '<1 min',
      '10 min',
      '3 h',
      '3 d',
      '2 mo',
      '1.5 y',
    ])
    expect(countOf(1, 'card')).toBe('1 card')
    expect(countOf(1200, 'card')).toBe('1,200 cards')
    const now = new Date('2026-11-04T10:00:00Z')
    expect(formatMoment('2026-11-04T15:40:00Z', now, 180)).toBe('18:40')
    expect(formatMoment('2026-11-05T06:15:00Z', now, 180)).toBe('tomorrow 09:15')
  })
})

describe('the queue', () => {
  const row = (cardId: string, noteId = cardId, due = '2026-11-04T09:00:00Z') => ({ cardId, noteId, due })

  test('learning first, then reviews with new cards spread among them, up to the new limit', () => {
    const queue = buildQueue({
      learning: [row('l2', 'n9', '2026-11-04T09:05:00Z'), row('l1', 'n8', '2026-11-04T09:00:00Z')],
      review: ['r1', 'r2', 'r3', 'r4'].map((id) => row(id)),
      fresh: ['f1', 'f2', 'f3'].map((id) => row(id)),
      newLimit: 2,
    })
    expect(queue.map((entry) => entry.cardId)).toEqual(['l1', 'l2', 'r1', 'r2', 'f1', 'r3', 'r4', 'f2'])
  })

  test('one card per note: siblings and notes already in learning wait', () => {
    const queue = buildQueue({
      learning: [row('a-fwd', 'a')],
      review: [row('a-rev', 'a'), row('b-fwd', 'b')],
      fresh: [row('b-rev', 'b'), row('c1', 'c'), row('c2', 'c')],
      newLimit: 10,
    })
    expect(queue.map((entry) => entry.cardId)).toEqual(['a-fwd', 'b-fwd', 'c1'])
    expect(interleave([], [1, 2])).toEqual([1, 2])
  })
})

describe('the scheduler', () => {
  const settings = { retention: 0.9 as const }
  const start = new Date('2026-11-04T10:00:00Z')

  test('a new card steps through 1 min and 10 min, Again sends a review card to relearning', () => {
    const scheduler = createScheduler(settings)
    const fresh = newCardState(start)
    const outcomes = scheduler.preview(fresh, start)
    expect(outcomes[1].intervalMs).toBe(MIN)
    expect(outcomes[3].intervalMs).toBe(10 * MIN)
    const learning = scheduler.grade(fresh, 3, start).memory
    expect(learning.state).toBe(1)
    const review = scheduler.grade(learning, 3, new Date(start.getTime() + 10 * MIN)).memory
    expect(review.state).toBe(2)
    const lapse = scheduler.grade(review, 1, new Date(review.due)).memory
    expect(lapse).toMatchObject({ state: 3, lapses: 1 })
    expect(Date.parse(lapse.due) - Date.parse(review.due)).toBe(10 * MIN)
  })

  test('replaying the log rebuilds the same memory', () => {
    const scheduler = createScheduler(settings)
    let memory = newCardState(start)
    const log: { rating: 1 | 3; reviewedAt: string }[] = []
    let at = start
    for (const rating of [3, 3, 3, 1, 3, 3] as const) {
      log.push({ rating, reviewedAt: at.toISOString() })
      memory = scheduler.grade(memory, rating, at).memory
      at = new Date(Math.max(Date.parse(memory.due), at.getTime() + MIN))
    }
    expect(rebuildCard(log, start.toISOString(), settings)).toEqual(memory)
  })

  test('a higher retention means shorter intervals', () => {
    expect(intervalFactor(0.9)).toBeCloseTo(1)
    expect(intervalFactor(0.95)).toBeLessThan(0.5)
    expect(intervalFactor(0.8)).toBeGreaterThan(3)
  })
})

describe('stats', () => {
  test('a streak counts back from today, or yesterday while today has nothing yet', () => {
    const days = ['2026-11-01', '2026-11-02', '2026-11-03'].map((day) => ({ day, reviews: 3, correct: 3, ms: 0 }))
    expect(streak(days, '2026-11-03')).toBe(3)
    expect(streak(days, '2026-11-04')).toBe(3)
    expect(streak(days, '2026-11-05')).toBe(0)
    const cells = heatmap(days, '2026-11-03', 3, 1)
    expect(cells.map((cell) => cell.goalMet)).toEqual([false, false, false, false, true, true, true])
  })

  test('the forecast puts overdue cards on today', () => {
    expect(forecastSeries([{ day: '2026-11-01', count: 2 }, { day: '2026-11-05', count: 1 }], '2026-11-04', 3)).toEqual([
      { day: '2026-11-04', count: 2 },
      { day: '2026-11-05', count: 1 },
      { day: '2026-11-06', count: 0 },
    ])
  })
})

describe('the route contract helpers', () => {
  test('a query round-trips through its schema', () => {
    const schema = z.object({ deckIds: z.array(z.string()).optional(), limit: z.number().optional(), on: z.boolean().optional(), q: z.string().optional() })
    const query = toQuery({ deckIds: ['a', 'b'], limit: 5, on: true, q: 'x y', empty: '' })
    expect(query).toBe('?deckIds=a%2Cb&limit=5&on=true&q=x+y')
    expect(fromQuery(schema, new URLSearchParams(query)).data).toEqual({ deckIds: ['a', 'b'], limit: 5, on: true, q: 'x y' })
    expect(pathOf('noteGet', { id: 'a/b' })).toBe('/rpc/recall/notes/a%2Fb')
  })

  test('media references become served URLs', () => {
    expect(withMediaUrls('![x](media/ab.png) <img src="media/cd.jpg">', (file) => `/u/${file}`)).toBe(
      '![x](/u/ab.png) <img src="/u/cd.jpg">',
    )
  })
})
