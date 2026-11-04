import type { Card, Note } from '../shared/model'
import { DEFAULT_SETTINGS } from '../shared/model'
import type { DeckSummary, LibraryRow, NoteDetail, StudyCard, TodaySummary } from '../shared/payloads'
import type { Heatmap, SettingsResult, Stats } from '../shared/payloads-more'

/** Small builders for the screen's tests: the same shapes the backend answers, with sane defaults. */

const AT = '2026-11-04T09:00:00.000Z'

export const deck = (id: string, name: string, over: Partial<DeckSummary> = {}): DeckSummary => ({
  id,
  name,
  description: '',
  color: 1,
  createdAt: AT,
  notes: 10,
  cards: 10,
  due: 3,
  new: 2,
  drafts: 0,
  paused: 0,
  nextDueAt: null,
  ...over,
})

export const note = (id: string, front: string, over: Partial<Note> = {}): Note => ({
  id,
  deckId: 'd1',
  kind: 'basic',
  front,
  back: `Answer to ${front}`,
  extra: '',
  tags: [],
  status: 'active',
  source: 'manual',
  createdAt: AT,
  updatedAt: AT,
  ...over,
})

export const card = (id: string, noteId: string, over: Partial<Card> = {}): Card => ({
  id,
  noteId,
  variant: 'forward',
  due: '2026-11-06T09:00:00.000Z',
  stability: 4,
  difficulty: 5,
  scheduledDays: 2,
  learningSteps: 0,
  reps: 3,
  lapses: 0,
  state: 2,
  lastReview: AT,
  paused: false,
  skipUntil: null,
  leech: false,
  ...over,
})

export function row(id: string, front: string, over: Partial<Note> = {}, cardOver: Partial<Card> = {}): LibraryRow {
  const n = note(id, front, over)
  const c = card(`c-${id}`, id, cardOver)
  return {
    note: n,
    deck: n.deckId ? { id: n.deckId, name: n.deckId === 'd1' ? 'Spanish' : 'Biology', color: 1 } : null,
    cards: [c],
  }
}

export function detail(r: LibraryRow): NoteDetail {
  return {
    note: r.note,
    deck: r.deck,
    cards: r.cards.map((c) => ({ ...card(c.id, r.note.id, c), retrievability: 0.92 })),
    history: [],
  }
}

export function studyCard(id: string, front: string, over: Partial<StudyCard> = {}, noteOver: Partial<Note> = {}): StudyCard {
  const n = note(`n-${id}`, front, noteOver)
  return {
    kind: 'review',
    card: card(id, n.id),
    note: n,
    deck: { id: 'd1', name: 'Spanish', color: 1 },
    prompt: n.front,
    answer: n.back,
    expected: n.back,
    extra: n.extra,
    cloze: null,
    typed: false,
    outcomes: {
      '1': { due: AT, intervalMs: 600_000, label: '10 min' },
      '2': { due: AT, intervalMs: 86_400_000, label: '1 d' },
      '3': { due: AT, intervalMs: 3 * 86_400_000, label: '3 d' },
      '4': { due: AT, intervalMs: 9 * 86_400_000, label: '9 d' },
    },
    ...over,
  }
}

export const today = (over: Partial<TodaySummary> = {}): TodaySummary => ({
  day: '2026-11-04',
  due: { learning: 1, review: 11, new: 5, total: 17 },
  minutes: 4,
  nextDueAt: null,
  drafts: 0,
  inbox: 0,
  goal: { target: 20, done: 6 },
  streak: 3,
  decks: [deck('d1', 'Spanish'), deck('d2', 'Biology', { color: 2, due: 0, new: 0 })],
  inboxDue: 0,
  totals: { notes: 25, cards: 30 },
  ...over,
})

export const heatmap = (weeks = 12): Heatmap => ({
  cells: Array.from({ length: weeks * 7 }, (_, i) => {
    const day = new Date(Date.UTC(2026, 10, 4 - (weeks * 7 - 1) + i)).toISOString().slice(0, 10)
    return { day, reviews: i % 5, goalMet: i % 5 === 4, level: i % 5 }
  }),
  streak: 3,
  goal: 20,
  today: { day: '2026-11-04', reviews: 6 },
})

export const settingsResult = (over: Partial<SettingsResult['settings']> = {}): SettingsResult => ({
  settings: { ...DEFAULT_SETTINGS, ...over },
  estimates: { '0.8': 12, '0.9': 20, '0.95': 34 },
})

export const stats = (over: Partial<Stats> = {}): Stats => ({
  day: '2026-11-04',
  forecast: Array.from({ length: 30 }, (_, i) => ({
    day: new Date(Date.UTC(2026, 10, 4 + i)).toISOString().slice(0, 10),
    count: i % 4,
  })),
  perDay: Array.from({ length: 90 }, (_, i) => ({
    day: new Date(Date.UTC(2026, 7, 7 + i)).toISOString().slice(0, 10),
    reviews: i % 7,
    correct: i % 6,
    ms: 1000,
  })),
  retention: { actual: 0.91, target: 0.9, reviews: 240 },
  states: { new: 40, learning: 5, young: 60, mature: 120, paused: 2, hard: 3, drafts: 7 },
  hardest: [row('h1', 'Subjunctive trigger', {}, { lapses: 9, leech: true })],
  time: { todayMs: 600_000, last30Ms: 7_200_000, averageMs: 9000 },
  totals: { notes: 200, cards: 230, reviews: 1500 },
  ...over,
})
