import { describe, expect, test } from 'bun:test'
import type { LibraryPage, NoteDetail } from '../shared/payloads'
import { rebuildCard } from '../shared/scheduler'
import type { ImportBatch } from './import/types'
import { createService } from './service'
import { movableClock, recallApp, route } from './test-support'
import type { StudyNext } from '../shared/payloads'

/** Committing an import: decks, duplicates, drafts, and progress replayed through the scheduler. */

const batch = (overrides: Partial<ImportBatch> = {}): ImportBatch => ({
  source: 'spanish.apkg',
  format: 'apkg',
  decks: [{ name: 'Spanish', description: 'Words from class' }],
  notes: [
    {
      kind: 'basic',
      front: 'el perro',
      back: 'the dog',
      extra: '',
      tags: ['animals'],
      deck: 'Spanish',
      progress: {
        forward: [
          { rating: 3, reviewedAt: '2026-10-01T09:00:00.000Z', durationMs: 5000 },
          { rating: 3, reviewedAt: '2026-10-01T09:10:00.000Z' },
          { rating: 1, reviewedAt: '2026-10-12T09:00:00.000Z' },
          { rating: 3, reviewedAt: '2026-10-12T09:10:00.000Z' },
        ],
      },
    },
    { kind: 'reversed', front: 'el gato', back: 'the cat', extra: 'meow', tags: [], deck: 'Spanish', paused: true },
    { kind: 'cloze', front: '{{c1::Madrid}} is the capital', back: '', extra: '', tags: [] },
    { kind: 'basic', front: 'no back', back: '', extra: '', tags: [] },
  ],
  media: [],
  mediaCounts: { pictures: 0, sounds: 0 },
  notices: ['No study history in the file, so every card starts as new.'],
  warnings: ['2 sounds dropped'],
  ...overrides,
})

describe('import commit', () => {
  test('previews without writing, then commits notes, decks and replayed progress', async () => {
    await using ctx = await recallApp()
    const service = createService({ dataDir: ctx.dataDir, clock: ctx.clock })

    const preview = service.previewImport(batch())
    expect(preview).toMatchObject({ notes: 4, cards: 5, duplicates: 0, withProgress: 1, warnings: ['2 sounds dropped'], notices: ['No study history in the file, so every card starts as new.'] })
    expect(preview.decks).toEqual([{ name: 'Spanish', notes: 2, exists: false }])
    expect((await route<LibraryPage>(ctx.app, 'library')).total).toBe(0)

    const result = await service.commitImport(batch(), { status: 'active', keepProgress: true })
    expect(result).toMatchObject({ added: 3, cards: 4, skippedDuplicates: 0, decksCreated: ['Spanish'], reviewsReplayed: 4 })
    expect(result.warnings).toEqual(['2 sounds dropped', '1 note without a front or back skipped'])
    expect(result.notices).toEqual(['No study history in the file, so every card starts as new.'])

    const page = await route<LibraryPage>(ctx.app, 'library', { query: { q: 'perro' } })
    const detail = await route<NoteDetail>(ctx.app, 'noteGet', { params: { id: page.rows[0]!.note.id } })
    expect(detail.deck?.name).toBe('Spanish')
    expect(detail.note.source).toBe('import:spanish.apkg')
    expect(detail.history.map((r) => r.source)).toEqual(['import', 'import', 'import', 'import'])
    const card = detail.cards[0]!
    expect(card.lapses).toBe(1)
    // The memory is exactly what replaying the log gives: the log is the truth.
    const rebuilt = rebuildCard(
      [...detail.history].reverse().map((r) => ({ rating: r.rating, reviewedAt: r.reviewedAt })),
      '2026-11-04T10:00:00.000Z',
      { retention: 0.9 },
    )
    expect({ due: card.due, stability: card.stability, state: card.state }).toEqual({
      due: rebuilt.due,
      stability: rebuilt.stability,
      state: rebuilt.state,
    })

    const cat = (await route<LibraryPage>(ctx.app, 'library', { query: { q: 'gato' } })).rows[0]!
    expect(cat.cards.map((c) => c.paused)).toEqual([true, true])
  })

  test('a preview counts pictures and sounds apart, and a preview batch can never be committed', async () => {
    await using ctx = await recallApp()
    const service = createService({ dataDir: ctx.dataDir, clock: ctx.clock })
    const counted = batch({ mediaCounts: { pictures: 2, sounds: 5 }, preview: true })
    expect(service.previewImport(counted)).toMatchObject({ media: 7, pictures: 2, sounds: 5 })
    await expect(service.commitImport(counted)).rejects.toThrow('only a preview')
    expect((await route<LibraryPage>(ctx.app, 'library')).total).toBe(0)
  })

  test('a second import skips exact duplicates; without keepProgress cards start new', async () => {
    await using ctx = await recallApp()
    const service = createService({ dataDir: ctx.dataDir, clock: movableClock('2026-11-04T10:00:00.000Z') })
    await service.commitImport(batch(), { keepProgress: false })
    const again = await service.commitImport(batch())
    expect(again.added).toBe(0)
    expect(again.skippedDuplicates).toBe(3)
    const page = await route<LibraryPage>(ctx.app, 'library', { query: { q: 'perro' } })
    expect(page.rows[0]!.note.status).toBe('draft')
    expect(page.rows[0]!.cards[0]!.state).toBe(0)
  })

  test('everything can go into one chosen deck, which must exist', async () => {
    await using ctx = await recallApp()
    const service = createService({ dataDir: ctx.dataDir, clock: ctx.clock })
    const { deck } = await service.saveDeck({ name: 'Inbox from class' })
    const result = await service.commitImport(batch(), { deckId: deck.id })
    expect(result.decksCreated).toEqual([])
    expect(result.decks).toEqual([{ id: deck.id, name: 'Inbox from class', color: deck.color, notes: 3 }])
    await expect(service.commitImport(batch(), { deckId: 'nope' })).rejects.toThrow('No deck has that id')
  })

  test('imported notes are studied in the order of the file', async () => {
    await using ctx = await recallApp()
    const service = createService({ dataDir: ctx.dataDir, clock: ctx.clock })
    const fronts = Array.from({ length: 12 }, (_, index) => `word ${index + 1}`)
    const ordered = batch({
      decks: [],
      warnings: [],
      notices: [],
      notes: fronts.map((front) => ({ kind: 'basic' as const, front, back: 'x', extra: '', tags: [] })),
    })
    await service.commitImport(ordered, { status: 'active' })
    const seen: string[] = []
    for (let index = 0; index < fronts.length; index += 1) {
      const next = await route<StudyNext>(ctx.app, 'studyNext')
      seen.push(next.card!.note.front)
      await route(ctx.app, 'studyGrade', { body: { cardId: next.card!.card.id, rating: 3 } })
    }
    expect(seen).toEqual(fronts)
  })

  test('the library lists imported notes in the order of the file, oldest first, and reversed newest first', async () => {
    await using ctx = await recallApp()
    const service = createService({ dataDir: ctx.dataDir, clock: ctx.clock })
    const fronts = Array.from({ length: 25 }, (_, index) => `word ${index + 1}`)
    await service.commitImport(
      batch({
        decks: [],
        warnings: [],
        notices: [],
        notes: fronts.map((front) => ({ kind: 'basic' as const, front, back: 'x', extra: '', tags: [] })),
      }),
      { status: 'active' },
    )
    const listed = async (sort: 'oldest' | 'newest') =>
      (await route<LibraryPage>(ctx.app, 'library', { query: { sort, limit: 100 } })).rows.map((row) => row.note.front)
    expect(await listed('oldest')).toEqual(fronts)
    expect(await listed('newest')).toEqual([...fronts].reverse())
  })
})
