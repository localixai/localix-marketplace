import { describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { onStoreWrite } from '@localixai/mini-app-sdk/backend'
import type { LibraryPage, NoteDetail, SaveNoteResult } from '../shared/payloads'
import { addReady, rawRoute, recallApp, route } from './test-support'

/** The Cards tab: notes, their cards, decks, the library, bulk actions and media. */

describe('notes and decks', () => {
  test('editing a cloze keeps the cards whose number stays, and adds or removes the rest', async () => {
    await using ctx = await recallApp()
    const made = await route<SaveNoteResult>(ctx.app, 'noteCreate', {
      body: { kind: 'cloze', front: '{{c1::Paris}} is the capital of {{c2::France}}' },
    })
    expect(made.cards.map((card) => card.variant)).toEqual(['c1', 'c2'])
    const c1 = made.cards[0]!.id

    const edited = await route<SaveNoteResult>(ctx.app, 'noteUpdate', {
      params: { id: made.note.id },
      body: { front: '{{c1::Paris}} lies on the {{c3::Seine}}' },
    })
    expect(edited.cards.map((card) => card.variant)).toEqual(['c1', 'c3'])
    expect(edited.cards[0]!.id).toBe(c1)

    const basic = await route<SaveNoteResult>(ctx.app, 'noteUpdate', {
      params: { id: made.note.id },
      body: { kind: 'reversed', front: 'Paris', back: 'capital of France' },
    })
    expect(basic.cards.map((card) => card.variant)).toEqual(['forward', 'reverse'])
  })

  test('a note that cannot make a card is refused with a sentence', async () => {
    await using ctx = await recallApp()
    const refused = await route(ctx.app, 'noteCreate', { body: { kind: 'cloze', front: 'no marks' }, expect: 422 })
    expect(refused.error.message).toContain('{{c1::')
    await route(ctx.app, 'noteCreate', { body: { front: 'Front only' }, expect: 422 })
  })

  test('removing a deck moves its cards to the Inbox, or deletes them', async () => {
    await using ctx = await recallApp()
    await addReady(ctx.app, [{ front: 'A?', back: 'a' }, { front: 'B?', back: 'b' }], 'Keep')
    await addReady(ctx.app, [{ front: 'C?', back: 'c' }], 'Drop')
    const decks = (await route(ctx.app, 'decks')).decks as { id: string; name: string }[]
    const keep = decks.find((deck) => deck.name === 'Keep')!
    const drop = decks.find((deck) => deck.name === 'Drop')!

    expect(await route(ctx.app, 'deckRemove', { params: { id: keep.id }, body: { cards: 'inbox' } })).toEqual({
      removed: 'Keep',
      moved: 2,
      deleted: 0,
    })
    expect(await route(ctx.app, 'deckRemove', { params: { id: drop.id }, body: { cards: 'delete' } })).toEqual({
      removed: 'Drop',
      moved: 0,
      deleted: 1,
    })
    const all = await route<LibraryPage>(ctx.app, 'library')
    expect(all.total).toBe(2)
    expect(all.rows.every((row) => row.deck === null)).toBe(true)
    await route(ctx.app, 'deckRemove', { params: { id: drop.id }, body: { cards: 'inbox' }, expect: 404 })
  })

  test('deck names are unique whatever their case', async () => {
    await using ctx = await recallApp()
    await route(ctx.app, 'deckCreate', { body: { name: 'Spanish' } })
    const clash = await route(ctx.app, 'deckCreate', { body: { name: 'spanish' }, expect: 409 })
    expect(clash.error.message).toContain('Spanish')
  })

  test('the library pages, filters and sorts without loading everything', async () => {
    await using ctx = await recallApp()
    const fronts = Array.from({ length: 12 }, (_, i) => ({ front: `Word ${String(i).padStart(2, '0')}`, back: 'x', tags: i % 2 ? ['odd'] : [] }))
    await addReady(ctx.app, fronts, 'Words')
    await route(ctx.app, 'noteCreate', { body: { front: 'Draft card', back: 'y', status: 'draft' } })

    const page = await route<LibraryPage>(ctx.app, 'library', { query: { limit: 5, sort: 'alpha' } })
    expect(page.total).toBe(13)
    expect(page.rows.map((row) => row.note.front)).toEqual(['Draft card', 'Word 00', 'Word 01', 'Word 02', 'Word 03'])
    expect(page.nextOffset).toBe(5)
    const last = await route<LibraryPage>(ctx.app, 'library', { query: { limit: 5, offset: 10, sort: 'alpha' } })
    expect(last.rows).toHaveLength(3)
    expect(last.nextOffset).toBeNull()

    expect((await route<LibraryPage>(ctx.app, 'library', { query: { tags: ['odd'] } })).total).toBe(6)
    expect((await route<LibraryPage>(ctx.app, 'library', { query: { states: ['draft'] } })).total).toBe(1)
    expect((await route<LibraryPage>(ctx.app, 'library', { query: { q: 'word 1' } })).total).toBe(2)
    await route(ctx.app, 'library', { query: { limit: 999 }, expect: 400 })
  })

  test('bulk actions tag, pause, move and delete many notes in one go', async () => {
    await using ctx = await recallApp()
    const ids = await addReady(ctx.app, [{ front: 'A?', back: 'a' }, { front: 'B?', back: 'b' }])
    const tagged = await route(ctx.app, 'bulk', { body: { ids, action: 'tag-add', tags: ['#Exam'] } })
    expect(tagged.message).toBe('Tagged 2 notes: #exam.')
    const paused = await route(ctx.app, 'bulk', { body: { ids, action: 'pause' } })
    expect(paused.message).toBe('Paused 2 cards of 2 notes.')
    expect((await route(ctx.app, 'studyNext')).card).toBeNull()
    const moved = await route(ctx.app, 'bulk', { body: { ids: [ids[0]], action: 'move', deckId: 'inbox' } })
    expect(moved.message).toBe('Moved 1 note to the Inbox.')
    await route(ctx.app, 'bulk', { body: { ids, action: 'delete' } })
    expect((await route<LibraryPage>(ctx.app, 'library')).total).toBe(0)
    await route(ctx.app, 'bulk', { body: { ids, action: 'pause' }, expect: 404 })
  })

  test('drafts wait until accepted, and discarding removes them', async () => {
    await using ctx = await recallApp()
    for (const front of ['One?', 'Two?']) {
      await route(ctx.app, 'noteCreate', { body: { front, back: 'x', status: 'draft' } })
    }
    expect((await route(ctx.app, 'today')).drafts).toBe(2)
    expect((await route(ctx.app, 'studyNext')).counts.total).toBe(0)
    const page = await route<LibraryPage>(ctx.app, 'library', { query: { status: 'draft', sort: 'oldest' } })
    await route(ctx.app, 'drafts', { body: { action: 'accept', ids: [page.rows[0]!.note.id] } })
    await route(ctx.app, 'drafts', { body: { action: 'discard' } })
    const today = await route(ctx.app, 'today')
    expect(today.drafts).toBe(0)
    expect(today.totals.notes).toBe(1)
    expect(today.due.new).toBe(1)
  })

  test('a note read shows its cards, retention and history', async () => {
    await using ctx = await recallApp()
    const [id] = await addReady(ctx.app, [{ front: 'Q', back: 'A' }])
    const cardId = (await route(ctx.app, 'studyNext')).card.card.id
    await route(ctx.app, 'studyGrade', { body: { cardId, rating: 4 } })
    const detail = await route<NoteDetail>(ctx.app, 'noteGet', { params: { id: id! } })
    expect(detail.history).toHaveLength(1)
    expect(detail.cards[0]!.retrievability).toBe(1)
    await route(ctx.app, 'noteGet', { params: { id: 'nope' }, expect: 404 })
  })

  test('every write bumps the revision the open screen follows', async () => {
    await using ctx = await recallApp()
    const writes: string[] = []
    const stop = onStoreWrite((path) => writes.push(path))
    const before = (await route(ctx.app, 'revision')).revision
    await route(ctx.app, 'noteCreate', { body: { front: 'Q', back: 'A' } })
    stop()
    expect((await route(ctx.app, 'revision')).revision).toBe(before + 1)
    expect(writes.some((path) => path.endsWith('revision.json'))).toBe(true)
  })

  test('media is served by name, and nothing outside the media folder is', async () => {
    await using ctx = await recallApp()
    mkdirSync(join(ctx.dataDir, 'media'), { recursive: true })
    writeFileSync(join(ctx.dataDir, 'media', 'abc.png'), new Uint8Array([137, 80, 78, 71]))
    const image = await rawRoute(ctx.app, 'GET', '/media/abc.png')
    expect(image.status).toBe(200)
    expect(image.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]))
    expect((await rawRoute(ctx.app, 'GET', '/media/..%2Frecall.db')).status).toBe(404)
    expect((await rawRoute(ctx.app, 'GET', '/media/missing.png')).status).toBe(404)
  })
})
