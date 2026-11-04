import { describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { onStoreWrite } from '@localixai/mini-app-sdk/backend'
import type { LibraryPage, NoteDetail, SaveNoteResult } from '../shared/payloads'
import { createService } from './service'
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

  describe('a bulk action over everything a list matches', () => {
    const everything = { sort: 'newest' as const }
    async function filled(ctx: Awaited<ReturnType<typeof recallApp>>) {
      await addReady(ctx.app, [
        { front: 'Hola', back: 'hello', tags: ['greek'] },
        { front: 'Adios', back: 'bye', tags: ['greek'] },
        { front: 'Mitosis', back: 'division', tags: ['bio'] },
      ])
      return (await route<LibraryPage>(ctx.app, 'library', { query: { tags: ['greek'] } })).rows.map((row) => row.note.id)
    }

    test('tags, moves and deletes exactly the matching notes and no others', async () => {
      await using ctx = await recallApp()
      const greek = await filled(ctx)
      const match = { ...everything, tags: ['greek'] }
      const tagged = await route(ctx.app, 'bulk', { body: { match, expect: 2, action: 'tag-add', tags: ['exam'] } })
      expect(tagged).toEqual({ affected: 2, message: 'Tagged 2 notes: #exam.' })
      const exam = await route<LibraryPage>(ctx.app, 'library', { query: { tags: ['exam'] } })
      expect(exam.rows.map((row) => row.note.id).sort()).toEqual([...greek].sort())

      const deck = await route(ctx.app, 'deckCreate', { body: { name: 'Greek' } })
      await route(ctx.app, 'bulk', { body: { match, expect: 2, action: 'move', deckId: deck.id } })
      expect((await route<LibraryPage>(ctx.app, 'library', { query: { deckIds: [deck.id] } })).total).toBe(2)

      const deleted = await route(ctx.app, 'bulk', { body: { match, expect: 2, action: 'delete' } })
      expect(deleted.affected).toBe(2)
      const left = await route<LibraryPage>(ctx.app, 'library')
      expect(left.rows.map((row) => row.note.front)).toEqual(['Mitosis'])
    })

    test('a count that is not the list\'s any more is refused with a 409 and nothing changes', async () => {
      await using ctx = await recallApp()
      await filled(ctx)
      const match = { ...everything, tags: ['greek'] }
      await route(ctx.app, 'bulk', { body: { match, expect: 3, action: 'delete' }, expect: 409 })
      expect((await route<LibraryPage>(ctx.app, 'library')).total).toBe(3)
      const answer = await jsonPost(ctx.app, '/notes/bulk', { match, expect: 5, action: 'delete' })
      expect(answer.status).toBe(409)
      expect((answer.json as { error: { message: string } }).error.message).toBe(
        'The list changed — look again before you do this to every card.',
      )
    })

    test('ids and match together, or neither, are a 400', async () => {
      await using ctx = await recallApp()
      const ids = await filled(ctx)
      await route(ctx.app, 'bulk', { body: { ids, match: everything, expect: 2, action: 'pause' }, expect: 400 })
      await route(ctx.app, 'bulk', { body: { action: 'pause' }, expect: 400 })
      await route(ctx.app, 'bulk', { body: { match: everything, action: 'pause' }, expect: 400 })
      expect((await route<LibraryPage>(ctx.app, 'library', { query: { states: ['paused'] } })).total).toBe(0)
    })

    test('more than 5,000 matches work: no id list is sent, so no cap applies', async () => {
      await using ctx = await recallApp()
      const service = createService({ dataDir: ctx.dataDir, clock: ctx.clock })
      const total = 5200
      await service.addNotes(
        Array.from({ length: total }, (_, index) => ({ front: `word ${index}`, back: 'x', tags: ['big'] })),
        { source: 'manual', status: 'active', skipDuplicates: false },
      )
      const match = { ...everything, tags: ['big'] }
      const paused = await route(ctx.app, 'bulk', { body: { match, expect: total, action: 'pause' } })
      expect(paused.affected).toBe(total)
      expect((await route<LibraryPage>(ctx.app, 'library', { query: { states: ['paused'] } })).total).toBe(total)
      await route(ctx.app, 'bulk', { body: { match, expect: total, action: 'delete' } })
      expect((await route<LibraryPage>(ctx.app, 'library')).total).toBe(0)
    })

    test('a meaning search cannot be resolved on the server, so it is refused rather than guessed', async () => {
      await using ctx = await recallApp()
      await filled(ctx)
      await route(ctx.app, 'bulk', { body: { match: { q: 'greeting', mode: 'meaning' }, expect: 1, action: 'delete' }, expect: 422 })
    })
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

  test('sounds are served with the type a player expects', async () => {
    await using ctx = await recallApp()
    mkdirSync(join(ctx.dataDir, 'media'), { recursive: true })
    const types: Record<string, string> = {
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      ogg: 'audio/ogg',
      oga: 'audio/ogg',
      opus: 'audio/ogg',
      wav: 'audio/wav',
      flac: 'audio/flac',
    }
    for (const [extension, type] of Object.entries(types)) {
      writeFileSync(join(ctx.dataDir, 'media', `clip.${extension}`), new Uint8Array([1, 2, 3]))
      const answer = await rawRoute(ctx.app, 'GET', `/media/clip.${extension}`)
      expect([extension, answer.status, answer.headers.get('content-type')]).toEqual([extension, 200, type])
    }
  })
})

async function jsonPost(app: Parameters<typeof rawRoute>[0], path: string, body: object) {
  const mount = [app.backend ?? []].flat().find((part) => part.routeMount)!.routeMount!
  const response = await mount.app.request(
    path,
    { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } },
    { userId: 'test-user', projectId: '', cwd: '/' },
  )
  return { status: response.status, json: await response.json() }
}
