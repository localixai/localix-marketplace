import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { callTool } from '@localixai/mini-app-sdk/backend/testing'
import type { LibraryPage } from '../shared/payloads'
import { buildApkg, greekDeck } from './import/test-support'
import { addReady, recallApp, route } from './test-support'

/** Every agent tool, called as the agent calls it, and what it is told back. */

const ID = /[0-9a-f]{8}-[0-9a-f-]{27}/

describe('the agent tools', () => {
  test('overview first: an empty collection says so, then counts what is due', async () => {
    await using ctx = await recallApp()
    expect((await callTool(ctx.app, 'recall_overview', {})).text).toContain('Recall is empty')
    await addReady(ctx.app, [{ front: 'Q1', back: 'A' }, { front: 'Q2', back: 'A' }], 'Biology')
    const overview = await callTool(ctx.app, 'recall_overview', {})
    expect(overview.text).toContain('To study now: 2 (0 reviews, 0 learning, 2 new)')
    expect(overview.text).toMatch(/- Biology \(id .+\): 2 notes, 2 to study today/)
  })

  test('add_cards makes drafts, skips exact duplicates and refuses a bad batch whole', async () => {
    await using ctx = await recallApp()
    const added = await callTool(ctx.app, 'recall_add_cards', {
      deck: 'Spanish',
      cards: [
        { front: 'el perro', back: 'the dog' },
        { kind: 'cloze', front: '{{c1::Madrid}} is the capital of {{c2::Spain}}', tags: ['#Geo'] },
      ],
    })
    expect(added.isError).toBe(false)
    expect(added.text).toContain('Added 2 notes (3 cards) as drafts')
    expect(added.text).toContain('review the drafts')
    const again = await callTool(ctx.app, 'recall_add_cards', { cards: [{ front: 'El perro!', back: 'dog' }] })
    expect(again.text).toContain('Added nothing new.')
    expect(again.text).toContain('Skipped 1 exact duplicate')

    const bad = await callTool(ctx.app, 'recall_add_cards', {
      cards: [{ front: 'fine', back: 'ok' }, { kind: 'cloze', front: 'no marks' }],
    })
    expect(bad).toEqual({ isError: true, text: expect.stringContaining('#2 "no marks"') })
    expect((await route<LibraryPage>(ctx.app, 'library')).total).toBe(2)
  })

  test('the add tool shows the limits it keeps', async () => {
    await using ctx = await recallApp()
    const tool = ctx.app.tools?.find((t) => t.name === 'recall_add_cards')
    const accepts = (input: unknown) => tool?.inputSchema.safeParse(input).success
    expect(accepts({ cards: [{ front: 'Q', back: 'A' }] })).toBe(true)
    expect(accepts({ cards: [] })).toBe(false)
    expect(accepts({ cards: Array.from({ length: 201 }, () => ({ front: 'Q' })) })).toBe(false)
    expect(accepts({ cards: [{ front: '   ' }] })).toBe(false)
  })

  test('find, get and update a card by id', async () => {
    await using ctx = await recallApp()
    const [id] = await addReady(ctx.app, [{ front: 'Mitochondria?', back: 'powerhouse' }], 'Biology')
    const found = await callTool(ctx.app, 'recall_find_cards', { query: 'mito', deck: 'biology' })
    expect(found.text).toContain('1 note match; showing 1–1.')
    expect(found.text).toContain(`id ${id}`)
    expect((await callTool(ctx.app, 'recall_find_cards', { deck: 'Nope' })).text).toContain('No deck is called "Nope"')
    const meaning = await callTool(ctx.app, 'recall_find_cards', { query: 'cell energy', mode: 'meaning' })
    expect(meaning.text).toContain('Meaning search is not ready here; matched by words instead.')

    const updated = await callTool(ctx.app, 'recall_update_card', { id, back: 'the powerhouse of the cell', deck: 'Cells' })
    expect(updated.text).toContain('Changed back, deck of "Mitochondria?"')
    const read = await callTool(ctx.app, 'recall_get_card', { id })
    expect(read.text).toContain('in Cells')
    expect(read.text).toContain('Back: the powerhouse of the cell')
    for (const tool of ['recall_get_card', 'recall_update_card']) {
      expect(await callTool(ctx.app, tool, { id: 'nope', back: 'x' })).toEqual({
        isError: true,
        text: expect.stringContaining('No card has that id'),
      })
    }
  })

  test('move, tag, set state, review drafts and remove', async () => {
    await using ctx = await recallApp()
    const [a, b] = await addReady(ctx.app, [{ front: 'A?', back: 'a' }, { front: 'B?', back: 'b' }])
    expect((await callTool(ctx.app, 'recall_move_cards', { ids: [a, b], deck: 'Letters' })).text).toBe(
      'Made the deck "Letters". Moved 2 notes to Letters.',
    )
    expect((await callTool(ctx.app, 'recall_tag_cards', { ids: [a], add: ['vowel'] })).text).toBe('Tagged 1 note: #vowel.')
    expect((await callTool(ctx.app, 'recall_set_state', { ids: [b, 'ghost'], state: 'pause' })).text).toBe(
      'Paused 1 card of 1 note.\nNot found: ghost.',
    )
    expect((await callTool(ctx.app, 'recall_remove_cards', { ids: ['ghost'] })).isError).toBe(true)
    expect((await callTool(ctx.app, 'recall_remove_cards', { ids: [b] })).text).toContain('Deleted 1 note')

    await callTool(ctx.app, 'recall_add_cards', { cards: [{ front: 'C?', back: 'c' }, { front: 'D?', back: 'd' }], deck: 'Letters' })
    expect((await callTool(ctx.app, 'recall_review_drafts', { action: 'accept', deck: 'Letters' })).text).toBe(
      'Accepted 2 drafts: they are ready to study. 0 drafts left.',
    )
  })

  test('decks: list, save, remove with the cards moved', async () => {
    await using ctx = await recallApp()
    const saved = await callTool(ctx.app, 'recall_save_deck', { name: 'History', description: 'Dates' })
    expect(saved.text).toMatch(/^Made the deck "History" \(id .+\)\./)
    expect((await callTool(ctx.app, 'recall_save_deck', { name: 'history', description: 'Dates and people' })).text).toContain(
      'Changed the deck "history"',
    )
    await addReady(ctx.app, [{ front: '1066?', back: 'Hastings' }], 'History')
    expect((await callTool(ctx.app, 'recall_list_decks', {})).text).toContain('1 note, 1 to study today')
    const removed = await callTool(ctx.app, 'recall_remove_deck', { deck: 'History', cards: 'inbox' })
    expect(removed.text).toContain('Removed the deck "history" and moved 1 note to the Inbox.')
    expect((await callTool(ctx.app, 'recall_remove_deck', { deck: 'History', cards: 'inbox' })).isError).toBe(true)
  })

  test('quiz in the chat: next card, grade, and the grade counts like the screen', async () => {
    await using ctx = await recallApp()
    await addReady(ctx.app, [{ front: 'Capital of Peru?', back: 'Lima' }])
    const next = await callTool(ctx.app, 'recall_next_card', {})
    expect(next.text).toContain('Ask: Capital of Peru?')
    expect(next.text).toContain('Answer (keep it until they reply): Lima')
    const cardId = ID.exec(next.text)![0]
    const graded = await callTool(ctx.app, 'recall_grade_card', { cardId, rating: 4 })
    expect(graded.text).toMatch(/^Graded Easy: it comes back in \d+ d\./)
    expect(graded.text).toContain('Nothing to study now.')
    expect((await route(ctx.app, 'today')).goal.done).toBe(1)
    expect((await callTool(ctx.app, 'recall_grade_card', { cardId: 'nope', rating: 3 })).isError).toBe(true)
  })

  test('stats and settings read in words; settings change only what is given', async () => {
    await using ctx = await recallApp()
    await addReady(ctx.app, [{ front: 'Q', back: 'A' }])
    expect((await callTool(ctx.app, 'recall_stats', { days: 7 })).text).toContain('Forecast for 7 days')
    const before = await callTool(ctx.app, 'recall_settings', {})
    expect(before.text).toContain('new cards per day (newPerDay): 20')
    const changed = await callTool(ctx.app, 'recall_settings', { newPerDay: 5, retention: 0.95 })
    expect(changed.text).toContain('Changed retention, newPerDay.')
    expect(changed.text).toContain('retention (how much to remember) (retention): 95%')
    expect(changed.text).toContain('daily goal (reviews) (dailyGoal): 20')
  })

  test('export writes a JSON backup that imports back', async () => {
    await using ctx = await recallApp()
    await addReady(ctx.app, [{ front: 'Q', back: 'A' }], 'Deck')
    const exported = await callTool(ctx.app, 'recall_export', { format: 'json', path: join(ctx.dataDir, 'backup.json') })
    expect(exported.text).toContain('Exported 1 note, 1 card and 0 answers as json')
    const text = readFileSync(join(ctx.dataDir, 'backup.json'), 'utf8')
    expect(JSON.parse(text).version).toBe(1)

    await using other = await recallApp()
    mkdirSync(other.dataDir, { recursive: true })
    writeFileSync(join(other.dataDir, 'backup.json'), text)
    const preview = await callTool(other.app, 'recall_import_file', { path: join(other.dataDir, 'backup.json'), dryRun: true })
    expect(preview.text).toContain('Preview (nothing imported)')
    const imported = await callTool(other.app, 'recall_import_file', { path: join(other.dataDir, 'backup.json') })
    expect(imported.text).toContain('Imported 1 note')
  })

  test('importing a deck with sound previews without writing it, and says how many sounds', async () => {
    await using ctx = await recallApp()
    const { fixture, media, names } = greekDeck(10)
    const path = join(ctx.dataDir, 'greek.apkg')
    mkdirSync(ctx.dataDir, { recursive: true })
    writeFileSync(path, buildApkg('old', { fixture, media, mediaNames: names }))
    const preview = await callTool(ctx.app, 'recall_import_file', { path, dryRun: true })
    expect(preview.text).toContain('20 sounds')
    expect(existsSync(join(ctx.dataDir, 'media'))).toBe(false)
    const imported = await callTool(ctx.app, 'recall_import_file', { path, draft: false })
    expect(imported.text).toContain('Imported 10 notes (20 cards)')
    expect(readdirSync(join(ctx.dataDir, 'media'))).toHaveLength(20)
    // The agent reads a note with its sound as "(sound)", never as a link it cannot follow.
    const found = await callTool(ctx.app, 'recall_find_cards', { query: 'λέξη1' })
    expect(found.text).not.toContain('media/')
    expect(found.text).not.toContain('[audio]')
    expect(found.text).toContain('(sound)')
  })

  test('import says when there is no file, and does nothing', async () => {
    await using ctx = await recallApp()
    const missing = await callTool(ctx.app, 'recall_import_file', { path: 'nowhere.csv' })
    expect(missing).toEqual({ isError: true, text: expect.stringContaining('There is no file at') })
  })

  test('the guide names every tool, and no tool that does not exist', async () => {
    await using ctx = await recallApp()
    const names = (ctx.app.tools ?? []).map((tool) => tool.name).sort()
    const guide = readFileSync(join(import.meta.dir, '..', 'guide.md'), 'utf8')
    const named = [...new Set(guide.match(/recall_[a-z_]+/g))].sort()
    expect(named).toEqual(names)
    expect(names).toHaveLength(19)
  })
})
