import { describe, expect, test } from 'bun:test'
import type { Heatmap, SettingsResult, Stats } from '../shared/payloads-more'
import { addReady, DAY, rawRoute, recallApp, route } from './test-support'

/** The rest of the screen's routes: queue, decks, stats, heatmap, settings, import and export. */

describe('routes', () => {
  test('the queue lists what the session will show, in order', async () => {
    await using ctx = await recallApp()
    await addReady(ctx.app, [{ front: 'A', back: 'a' }, { front: 'B', back: 'b' }])
    const queue = await route(ctx.app, 'studyQueue')
    expect(queue.counts).toEqual({ learning: 0, review: 0, new: 2, total: 2 })
    expect(queue.entries.map((entry: { kind: string }) => entry.kind)).toEqual(['new', 'new'])
  })

  test('a deck can be renamed and recoloured', async () => {
    await using ctx = await recallApp()
    const deck = await route(ctx.app, 'deckCreate', { body: { name: 'Bio' } })
    const renamed = await route(ctx.app, 'deckUpdate', { params: { id: deck.id }, body: { name: 'Biology', color: 4 } })
    expect(renamed).toMatchObject({ id: deck.id, name: 'Biology', color: 4, notes: 0 })
    await route(ctx.app, 'deckUpdate', { params: { id: 'nope' }, body: { name: 'X' }, expect: 404 })
  })

  test('stats: forecast, reviews per day, retention and states', async () => {
    await using ctx = await recallApp()
    await addReady(ctx.app, [{ front: 'A', back: 'a' }, { front: 'B', back: 'b' }])
    for (let index = 0; index < 2; index += 1) {
      const { card } = await route(ctx.app, 'studyNext')
      await route(ctx.app, 'studyGrade', { body: { cardId: card.card.id, rating: 4, durationMs: 6000 } })
    }
    const stats = await route<Stats>(ctx.app, 'stats', { query: { days: 30 } })
    expect(stats.forecast).toHaveLength(30)
    expect(stats.forecast.reduce((sum, day) => sum + day.count, 0)).toBe(2)
    expect(stats.perDay).toHaveLength(90)
    expect(stats.perDay.at(-1)).toEqual({ day: '2026-11-04', reviews: 2, correct: 2, ms: 12000 })
    expect(stats.states).toMatchObject({ new: 0, young: 2 })
    expect(stats.retention).toEqual({ actual: null, target: 0.9, reviews: 0 })
    expect(stats.time).toEqual({ todayMs: 12000, last30Ms: 12000, averageMs: 6000 })
    await route(ctx.app, 'stats', { query: { days: 3 }, expect: 400 })
  })

  test('a deck summary says why nothing is due: drafts, paused cards, or when the next card comes', async () => {
    await using ctx = await recallApp()
    const draftsDeck = await route(ctx.app, 'deckCreate', { body: { name: 'Drafts' } })
    const pausedDeck = await route(ctx.app, 'deckCreate', { body: { name: 'Paused' } })
    const doneDeck = await route(ctx.app, 'deckCreate', { body: { name: 'Done' } })
    for (const front of ['One?', 'Two?']) {
      await route(ctx.app, 'noteCreate', { body: { front, back: 'x', status: 'draft', deckId: draftsDeck.id } })
    }
    const [pausedId] = await addReady(ctx.app, [{ front: 'P', back: 'p' }], 'Paused')
    await route(ctx.app, 'bulk', { body: { ids: [pausedId], action: 'pause' } })
    await addReady(ctx.app, [{ front: 'D', back: 'd' }], 'Done')
    const { card } = await route(ctx.app, 'studyNext', { query: { deckIds: doneDeck.id } })
    await route(ctx.app, 'studyGrade', { body: { cardId: card.card.id, rating: 3 } })

    const { decks } = await route(ctx.app, 'decks')
    const by = (id: string) => decks.find((deck: { id: string }) => deck.id === id)
    expect(by(draftsDeck.id)).toMatchObject({ drafts: 2, paused: 0, nextDueAt: null, due: 0 })
    expect(by(pausedDeck.id)).toMatchObject({ drafts: 0, paused: 1, nextDueAt: null, due: 0 })
    const done = by(doneDeck.id)
    expect(done).toMatchObject({ drafts: 0, paused: 0, due: 0 })
    expect(Date.parse(done.nextDueAt)).toBeGreaterThan(ctx.clock.now().getTime())
  })

  test('the heatmap marks the days the goal was met', async () => {
    await using ctx = await recallApp()
    await route(ctx.app, 'settingsUpdate', { body: { dailyGoal: 1 } })
    await addReady(ctx.app, [{ front: 'A', back: 'a' }, { front: 'B', back: 'b' }])
    const { card } = await route(ctx.app, 'studyNext')
    await route(ctx.app, 'studyGrade', { body: { cardId: card.card.id, rating: 4 } })
    ctx.clock.advance(DAY)
    const heat = await route<Heatmap>(ctx.app, 'heatmap')
    expect(heat.cells).toHaveLength(84)
    expect(heat.cells.at(-2)).toEqual({ day: '2026-11-04', reviews: 1, goalMet: true, level: 4 })
    expect(heat.streak).toBe(1)
    expect(heat.today).toEqual({ day: '2026-11-05', reviews: 0 })
  })

  test('the heatmap draws as many weeks as asked, 12 by default, 1 to 53', async () => {
    await using ctx = await recallApp()
    expect((await route<Heatmap>(ctx.app, 'heatmap')).cells).toHaveLength(84)
    const year = await route<Heatmap>(ctx.app, 'heatmap', { query: { weeks: 53 } })
    expect(year.cells).toHaveLength(53 * 7)
    expect(year.cells.at(-1)!.day).toBe(year.today.day)
    expect((await route<Heatmap>(ctx.app, 'heatmap', { query: { weeks: 1 } })).cells).toHaveLength(7)
    await route(ctx.app, 'heatmap', { query: { weeks: 54 }, expect: 400 })
    await route(ctx.app, 'heatmap', { query: { weeks: 0 }, expect: 400 })
  })

  test('settings read with estimates, change by patch, and refuse values out of range', async () => {
    await using ctx = await recallApp()
    const read = await route<SettingsResult>(ctx.app, 'settings')
    expect(read.settings.retention).toBe(0.9)
    expect(read.estimates).toEqual({ '0.8': 20, '0.9': 20, '0.95': 20 })
    const changed = await route<SettingsResult>(ctx.app, 'settingsUpdate', { body: { buttons: 'four' } })
    expect(changed.settings).toMatchObject({ buttons: 'four', newPerDay: 20 })
    await route(ctx.app, 'settingsUpdate', { body: { retention: 0.85 }, expect: 400 })
  })

  test('an empty upload is refused before it reaches a parser', async () => {
    await using ctx = await recallApp()
    const empty = await rawRoute(ctx.app, 'POST', '/import/preview?name=a.csv', new Uint8Array())
    expect(empty.status).toBe(400)
    expect((await rawRoute(ctx.app, 'POST', '/import/commit', new Uint8Array([1]))).status).toBe(400)
  })

  test('a CSV uploads, previews and commits; export downloads', async () => {
    await using ctx = await recallApp()
    const csv = new TextEncoder().encode('front,back\nhola,hello\nadios,goodbye\n')
    const preview = await rawRoute(ctx.app, 'POST', '/import/preview?name=words.csv', csv)
    expect(preview.status).toBe(200)
    expect(await preview.json()).toMatchObject({ format: 'csv', notes: 2 })
    const commit = await rawRoute(ctx.app, 'POST', '/import/commit?name=words.csv&status=active', csv)
    expect(await commit.json()).toMatchObject({ added: 2, status: 'active' })
    const download = await rawRoute(ctx.app, 'GET', '/export?format=csv')
    expect(download.headers.get('content-disposition')).toBe('attachment; filename="recall-2026-11-04.csv"')
    expect(await download.text()).toContain('hola')
  })
})
