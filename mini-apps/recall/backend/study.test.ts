import { describe, expect, test } from 'bun:test'
import type { GradeResult, NoteDetail, StudyNext, TodaySummary } from '../shared/payloads'
import { addReady, DAY, MINUTE, recallApp, route } from './test-support'

/** Studying on the screen: what the person is shown next, and what each answer does. */

const next = (app: Parameters<typeof route>[0], query: Record<string, unknown> = {}) =>
  route<StudyNext>(app, 'studyNext', { query })
const grade = (app: Parameters<typeof route>[0], cardId: string, rating: number) =>
  route<GradeResult>(app, 'studyGrade', { body: { cardId, rating, durationMs: 4000 } })

describe('studying', () => {
  test('a new card walks the learning steps (1 min, 10 min) before it graduates', async () => {
    await using ctx = await recallApp()
    await addReady(ctx.app, [{ front: 'Capital of France?', back: 'Paris' }])

    const first = await next(ctx.app)
    expect(first.card?.kind).toBe('new')
    expect(first.card?.outcomes['1'].label).toBe('1 min')
    expect(first.card?.outcomes['3'].label).toBe('10 min')
    const cardId = first.card!.card.id

    const step = await grade(ctx.app, cardId, 3)
    expect(step.label).toBe('10 min')
    // Nothing else is left, so the learning card is shown a little early (learn ahead).
    expect(step.next.card?.card.id).toBe(cardId)
    expect(step.next.card?.kind).toBe('learning')

    ctx.clock.advance(10 * MINUTE)
    const graduated = await grade(ctx.app, cardId, 3)
    expect(graduated.review.state).toBe(2)
    expect(graduated.label).toMatch(/^\d+ d$/)
    expect(graduated.next.card).toBeNull()
    expect(graduated.next.nextDueAt).toBe(graduated.review.due)
  })

  test('new cards stop at the daily limit and come back on the next study day', async () => {
    await using ctx = await recallApp()
    await route(ctx.app, 'settingsUpdate', { body: { newPerDay: 2 } })
    await addReady(ctx.app, ['a', 'b', 'c', 'd'].map((x) => ({ front: `Question ${x}`, back: x })))

    const before = await next(ctx.app)
    expect(before.counts).toEqual({ learning: 0, review: 0, new: 2, total: 2 })
    for (let index = 0; index < 2; index += 1) {
      const { card } = await next(ctx.app)
      await grade(ctx.app, card!.card.id, 4) // Easy: straight to review
    }
    const done = await next(ctx.app)
    expect(done.card).toBeNull()
    expect(done.counts.total).toBe(0)
    expect(done.nextDueAt).toBe('2026-11-05T04:00:00.000Z')

    ctx.clock.set('2026-11-05T04:01:00.000Z')
    expect((await next(ctx.app)).counts.new).toBe(2)
  })

  test('only one card of a note is shown a day: its sibling waits for tomorrow', async () => {
    await using ctx = await recallApp()
    await addReady(ctx.app, [{ kind: 'reversed', front: 'der Hund', back: 'the dog' }])

    const first = await next(ctx.app)
    expect(first.counts).toEqual({ learning: 0, review: 0, new: 1, total: 1 })
    await grade(ctx.app, first.card!.card.id, 4)
    expect((await next(ctx.app)).card).toBeNull()

    ctx.clock.set('2026-11-05T05:00:00.000Z')
    const tomorrow = await next(ctx.app)
    expect(tomorrow.card?.card.variant).toBe('reverse')
  })

  test('the study day starts at 4 am local: a 3:30 answer counts for the day before', async () => {
    await using ctx = await recallApp({ at: '2026-11-05T00:30:00.000Z', utcOffset: 180 }) // 03:30 local
    await addReady(ctx.app, [{ front: 'Q', back: 'A' }])
    const { card } = await next(ctx.app)
    await grade(ctx.app, card!.card.id, 3)

    const late = await route<TodaySummary>(ctx.app, 'today')
    expect(late.day).toBe('2026-11-04')
    expect(late.goal.done).toBe(1)

    ctx.clock.set('2026-11-05T01:30:00.000Z') // 04:30 local
    const morning = await route<TodaySummary>(ctx.app, 'today')
    expect(morning.day).toBe('2026-11-05')
    expect(morning.goal.done).toBe(0)
    expect(morning.streak).toBe(1)
  })

  test('undo puts the card back exactly as it was and removes the answer', async () => {
    await using ctx = await recallApp()
    const [noteId] = await addReady(ctx.app, [{ front: 'Q', back: 'A' }])
    const { card } = await next(ctx.app)
    await grade(ctx.app, card!.card.id, 4)
    ctx.clock.advance(5 * DAY)
    const before = await route<NoteDetail>(ctx.app, 'noteGet', { params: { id: noteId! } })
    await grade(ctx.app, card!.card.id, 1)

    const undone = await route(ctx.app, 'studyUndo', { body: {} })
    expect(undone.undone).toEqual({ cardId: card!.card.id, rating: 1 })
    expect(undone.card.card.id).toBe(card!.card.id)
    const after = await route<NoteDetail>(ctx.app, 'noteGet', { params: { id: noteId! } })
    expect(after.cards).toEqual(before.cards)
    expect(after.history).toEqual(before.history)
  })

  test('undo with nothing to undo says so and changes nothing', async () => {
    await using ctx = await recallApp()
    expect(await route(ctx.app, 'studyUndo', { body: {} })).toEqual({ card: null, undone: null })
  })

  test('the 8th lapse makes a card hard, without pausing it', async () => {
    await using ctx = await recallApp()
    await addReady(ctx.app, [{ front: 'Q', back: 'A' }])
    const id = (await next(ctx.app)).card!.card.id
    let result = await grade(ctx.app, id, 4)
    const hard: boolean[] = []
    for (let lapse = 1; lapse <= 8; lapse += 1) {
      ctx.clock.set(result.review.due)
      ctx.clock.advance(MINUTE)
      const missed = await grade(ctx.app, id, 1)
      hard.push(missed.becameHard)
      ctx.clock.advance(10 * MINUTE)
      result = await grade(ctx.app, id, 3)
    }
    expect(hard).toEqual([false, false, false, false, false, false, false, true])
    const card = (await route(ctx.app, 'studyCard', { params: { id } })).card
    expect(card).toMatchObject({ lapses: 8, leech: true, paused: false })
  })

  test('pause and skip take a card out of today, and a draft cannot be graded', async () => {
    await using ctx = await recallApp()
    await addReady(ctx.app, [
      { front: 'One', back: '1' },
      { front: 'Two', back: '2' },
    ])
    const first = (await next(ctx.app)).card!
    const afterPause = await route<StudyNext>(ctx.app, 'studyPause', { body: { cardId: first.card.id } })
    expect(afterPause.counts.total).toBe(1)
    const second = afterPause.card!
    const afterSkip = await route<StudyNext>(ctx.app, 'studySkip', { body: { cardId: second.card.id } })
    expect(afterSkip.card).toBeNull()
    ctx.clock.set('2026-11-05T04:30:00.000Z')
    expect((await next(ctx.app)).card?.card.id).toBe(second.card.id)

    const drafted = await route(ctx.app, 'noteCreate', { body: { front: 'Draft?', back: 'yes', status: 'draft' } })
    await route(ctx.app, 'studyGrade', {
      body: { cardId: drafted.cards[0].id, rating: 3 },
      expect: 422,
    })
  })

  test('the session can be filtered to a deck', async () => {
    await using ctx = await recallApp()
    await addReady(ctx.app, [{ front: 'Bio Q', back: 'A' }], 'Biology')
    await addReady(ctx.app, [{ front: 'Chem Q', back: 'A' }], 'Chemistry')
    const decks = (await route(ctx.app, 'decks')).decks as { id: string; name: string; due: number }[]
    const bio = decks.find((deck) => deck.name === 'Biology')!
    expect(bio.due).toBe(1)
    const only = await next(ctx.app, { deckIds: [bio.id] })
    expect(only.counts.total).toBe(1)
    expect(only.card?.note.front).toBe('Bio Q')
  })
})
