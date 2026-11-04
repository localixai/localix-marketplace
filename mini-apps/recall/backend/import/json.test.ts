import { describe, expect, test } from 'bun:test'
import type { RecallExport } from '../../shared/model'
import { exportCollection, parseImport } from './index'

const now = '2026-01-01T00:00:00.000Z'
const state = { due: now, stability: 3, difficulty: 5, scheduledDays: 3, learningSteps: 0, reps: 2, lapses: 0, state: 2, lastReview: now, skipUntil: null, leech: false }
const prev = null

const data: RecallExport = {
  version: 1,
  exportedAt: now,
  decks: [
    { id: 'd1', name: 'Spanish', description: 'Words', color: 2, createdAt: now },
    { id: 'd2', name: 'Unused', description: '', color: 1, createdAt: now },
  ],
  notes: [
    { id: 'n1', deckId: 'd1', kind: 'reversed', front: 'uno', back: 'one', extra: 'x', tags: ['num'], status: 'active', source: 'manual', createdAt: now, updatedAt: now },
    { id: 'n2', deckId: null, kind: 'cloze', front: '{{c1::a}} {{c2::b}}', back: '', extra: '', tags: [], status: 'draft', source: 'agent', createdAt: now, updatedAt: now },
  ],
  cards: [
    { ...state, id: 'c1', noteId: 'n1', variant: 'forward', paused: true },
    { ...state, id: 'c2', noteId: 'n1', variant: 'reverse', paused: true },
    { ...state, id: 'c3', noteId: 'n2', variant: 'c1', paused: false },
    { ...state, id: 'c4', noteId: 'n2', variant: 'c2', paused: false },
  ],
  reviews: [
    { id: 'r2', cardId: 'c2', noteId: 'n1', rating: 4, state: 2, due: now, stability: 1, difficulty: 1, scheduledDays: 1, elapsedDays: 1, reviewedAt: '2026-01-03T00:00:00.000Z', durationMs: 0, source: 'screen', prev },
    { id: 'r1', cardId: 'c1', noteId: 'n1', rating: 3, state: 2, due: now, stability: 1, difficulty: 1, scheduledDays: 1, elapsedDays: 1, reviewedAt: '2026-01-02T00:00:00.000Z', durationMs: 4200, source: 'chat', prev },
    { id: 'r0', cardId: 'c1', noteId: 'n1', rating: 1, state: 1, due: now, stability: 1, difficulty: 1, scheduledDays: 0, elapsedDays: 0, reviewedAt: '2026-01-01T00:00:00.000Z', durationMs: 1000, source: 'screen', prev },
  ],
  settings: { retention: 0.9, newPerDay: 20, buttons: 'two', dayStartsAt: 4, dailyGoal: 20, typedAnswerCheck: false, suggestPlacement: true },
}

const read = (text: string, name = 'recall.json') =>
  parseImport({ name, bytes: new TextEncoder().encode(text), mediaDir: '/nonexistent' })

describe('Recall JSON backup', () => {
  test('export then import keeps notes, decks, tags, kinds, pauses and every answer in order', async () => {
    const batch = await read(exportCollection(data, 'json'))
    expect(batch.format).toBe('json')
    expect(batch.decks).toEqual([{ name: 'Spanish', description: 'Words' }])
    expect(batch.notes).toEqual([
      {
        kind: 'reversed', front: 'uno', back: 'one', extra: 'x', tags: ['num'], deck: 'Spanish', paused: true,
        progress: {
          forward: [
            { rating: 1, reviewedAt: '2026-01-01T00:00:00.000Z', durationMs: 1000 },
            { rating: 3, reviewedAt: '2026-01-02T00:00:00.000Z', durationMs: 4200 },
          ],
          reverse: [{ rating: 4, reviewedAt: '2026-01-03T00:00:00.000Z' }],
        },
      },
      { kind: 'cloze', front: '{{c1::a}} {{c2::b}}', back: '', extra: '', tags: [] },
    ])
  })

  test('the JSON is the export itself, readable and stable', () => {
    expect(JSON.parse(exportCollection(data, 'json'))).toEqual(data)
  })

  test('a file that is not a Recall backup says so', async () => {
    await expect(read('{ nope')).rejects.toThrow(/not valid JSON/)
    await expect(read('{"version":1,"decks":[]}')).rejects.toThrow(/not a Recall backup/)
    await expect(read('{"version":2}')).rejects.toThrow(/newer version/)
  })

  test('a note with a picture warns that a backup holds no pictures', async () => {
    const withImage = { ...data, notes: [{ ...data.notes[0]!, front: '![](media/abc.png)' }] }
    const batch = await read(JSON.stringify(withImage))
    expect(batch.warnings[0]).toContain('1 note with images')
  })
})

describe('CSV export', () => {
  test('quotes what needs it and imports back', async () => {
    const csv = exportCollection(data, 'csv')
    expect(csv.split('\n')[0]).toBe('front,back,extra,tags,deck,kind')
    const batch = await read(csv, 'out.csv')
    expect(batch.notes.map((note) => [note.kind, note.front, note.back, note.extra, note.tags, note.deck])).toEqual([
      ['reversed', 'uno', 'one', 'x', ['num'], 'Spanish'],
      ['cloze', '{{c1::a}} {{c2::b}}', '', '', [], undefined],
    ])
  })

  test('multi-line cells and quotes survive', async () => {
    const tricky = { ...data, notes: [{ ...data.notes[0]!, front: 'say "hi",\nthen go', back: ' padded ' }] }
    const batch = await read(exportCollection(tricky, 'csv'), 'out.csv')
    expect(batch.notes[0]).toMatchObject({ front: 'say "hi",\nthen go', back: 'padded' })
  })
})
