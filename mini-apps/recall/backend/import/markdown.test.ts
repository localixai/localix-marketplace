import { describe, expect, test } from 'bun:test'
import type { RecallExport } from '../../shared/model'
import { exportCollection, parseImport } from './index'

const read = (text: string, name = 'cards.md') =>
  parseImport({ name, bytes: new TextEncoder().encode(text), mediaDir: '/nonexistent' })

describe('Markdown cards', () => {
  test('Q/A blocks, separators, decks, tags, extra and cloze', async () => {
    const batch = await read(`# Geography

Q: Capital of France?
A: Paris
E: On the Seine.
tags: europe, #Capitals

---

C: The {{c1::Seine}} runs through Paris.

# History / Rome
Q: Founded?
A: 753 BC
kind: reversed
`)
    expect(batch.format).toBe('markdown')
    expect(batch.decks.map((deck) => deck.name)).toEqual(['Geography', 'History / Rome'])
    expect(batch.notes).toEqual([
      { kind: 'basic', front: 'Capital of France?', back: 'Paris', extra: 'On the Seine.', tags: ['europe', 'capitals'], deck: 'Geography' },
      { kind: 'cloze', front: 'The {{c1::Seine}} runs through Paris.', back: '', extra: '', tags: [], deck: 'Geography' },
      { kind: 'reversed', front: 'Founded?', back: '753 BC', extra: '', tags: [], deck: 'History / Rome' },
    ])
  })

  test('answers and questions span lines; a new Q: ends a card without a separator', async () => {
    const batch = await read('Q: Line one\nline two\nA: a1\n\n- item\n- item2\nQ: Next\nA: b\n')
    expect(batch.notes.map((note) => [note.front, note.back])).toEqual([
      ['Line one\nline two', 'a1\n\n- item\n- item2'],
      ['Next', 'b'],
    ])
  })

  test('cards without an answer, and lines outside a card, are skipped and counted', async () => {
    const batch = await read('stray text\nQ: no answer\n---\nQ: ok\nA: yes\n---\nC: no mark\n')
    expect(batch.notes.map((note) => note.front)).toEqual(['ok'])
    expect(batch.warnings).toEqual([
      '1 card without a question or an answer skipped.',
      '1 cloze card without a {{c1::…}} mark skipped.',
      '1 line outside any card ignored.',
    ])
  })
})

const now = '2026-01-01T00:00:00.000Z'
const memory = { due: now, stability: 0, difficulty: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, state: 0, lastReview: null, paused: false, skipUntil: null, leech: false }
function collection(notes: [string, string, string, string[]][]): RecallExport {
  return {
    version: 1,
    exportedAt: now,
    decks: [{ id: 'd1', name: 'Deck One', description: '', color: 1, createdAt: now }],
    notes: notes.map(([front, back, extra, tags], index) => ({
      id: `n${index}`, deckId: index % 2 ? null : 'd1', kind: front.includes('{{c1::') ? 'cloze' : 'basic', front, back, extra, tags, status: 'active', source: 'manual', createdAt: now, updatedAt: now,
    })),
    cards: notes.map((_, index) => ({ ...memory, id: `c${index}`, noteId: `n${index}`, variant: 'forward' })),
    reviews: [],
    settings: { retention: 0.9, newPerDay: 20, buttons: 'two', dayStartsAt: 4, dailyGoal: 20, typedAnswerCheck: false, suggestPlacement: true },
  }
}

describe('Markdown export', () => {
  test('reads back to the same cards, including text that looks like markers', async () => {
    const data = collection([
      ['Plain question', 'Plain answer', '', ['a', 'b']],
      ['Multi\nline front', 'First\n\n- one\n- two', 'Extra\nlines', []],
      ['Tricky', 'first line\nA: not an answer\n# not a heading\n---\ntags: nope\nQ: nor this\n\\Q: or this', '', []],
      ['The {{c1::sun}} is a star', '', 'astronomy', ['space']],
      ['With  spaces & "quotes"', 'ünïcode 🙂', '', []],
    ])
    const text = exportCollection(data, 'markdown')
    const batch = await read(text)
    const original = data.notes.map((note, index) => ({ kind: note.kind, front: note.front, back: note.back, extra: note.extra, tags: note.tags, ...(index % 2 ? {} : { deck: 'Deck One' }) }))
    // Notes come back grouped by deck (no deck first), so compare by front.
    const byFront = <T extends { front: string }>(list: T[]) => [...list].sort((a, b) => a.front.localeCompare(b.front))
    expect(byFront(batch.notes)).toEqual(byFront(original))
    expect(batch.warnings).toEqual([])
  })
})
