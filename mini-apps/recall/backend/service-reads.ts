import { addDays, sqlDayModifiers, studyDay } from '../shared/day'
import { LIMITS, type Deck, type LibraryQuery, type Note, type RecallExport } from '../shared/model'
import type { DeckSummary, LibraryPage, LibraryRow, NoteDetail, TodaySummary } from '../shared/payloads'
import type { Heatmap, SettingsResult, Stats } from '../shared/payloads-more'
import { createScheduler } from '../shared/scheduler'
import { dailySeries, estimateMinutes, forecastSeries, heatmap, intervalFactor, retentionOf, streak } from '../shared/stats'
import type { Db } from './db'
import { notFound } from './errors'
import { cardsOfNote, cardsOfNotes, countCards, toCard, type CardRow } from './repo/cards'
import { deckCounts, listDecks } from './repo/decks'
import { filterClause } from './repo/filters'
import { countWhere, libraryWhere, pageWhere } from './repo/library'
import { countNotes, getNote, notesByIds, toNote } from './repo/notes'
import { averageDuration, historyOfNote, perDay, toReview } from './repo/reviews'
import { readSettings } from './repo/settings'
import { dailyLoad, forecastRows, hardestNoteIds, reviewRetention, scopedTotals, stateCounts, totalReviews } from './repo/stats'
import type { Core } from './service'
import { sessionQueue } from './service-study'

/** Reads for Today, Cards, Stats and Settings: aggregates in SQL, pages never the whole set. */

const ref = (deck: Deck | undefined) => (deck ? { id: deck.id, name: deck.name, color: deck.color } : null)

/** Library rows for these notes, in their order. */
export function rowsOf(db: Db, notes: readonly Note[]): LibraryRow[] {
  const cards = cardsOfNotes(db, notes.map((note) => note.id))
  const decks = new Map(listDecks(db).map((deck) => [deck.id, deck]))
  return notes.map((note) => ({
    note,
    deck: ref(note.deckId ? decks.get(note.deckId) : undefined),
    cards: (cards.get(note.id) ?? []).map(({ id, variant, state, due, paused, leech, skipUntil, lapses, reps }) => ({
      id, variant, state, due, paused, leech, skipUntil, lapses, reps,
    })),
  }))
}

function deckSummaries(db: Db, at: { now: string; start: string; end: string }, newLimit: number) {
  const counts = new Map(deckCounts(db, at).map((row) => [row.deckId, row]))
  const summary = (deckId: string | null) => {
    const row = counts.get(deckId)
    return {
      notes: row?.notes ?? 0,
      cards: row?.cards ?? 0,
      due: (row?.learning ?? 0) + (row?.review ?? 0) + Math.min(row?.fresh ?? 0, newLimit),
      new: Math.min(row?.fresh ?? 0, newLimit),
      drafts: row?.drafts ?? 0,
      paused: row?.paused ?? 0,
      nextDueAt: row?.nextDueAt ?? null,
    }
  }
  return { decks: listDecks(db).map((deck): DeckSummary => ({ ...deck, ...summary(deck.id) })), inbox: summary(null) }
}

export function readOps(core: Core) {
  const { clock } = core
  const offset = (now: Date) => clock.utcOffset(now)
  return {
    today: (): TodaySummary =>
      core.read((db, now) => {
        const session = sessionQueue(db, now, clock)
        const { window, settings } = session
        const day = studyDay(now, settings.dayStartsAt, offset(now))
        const mods = sqlDayModifiers(settings.dayStartsAt, offset(now))
        const days = perDay(db, addDays(day.key, -400) + 'T00:00:00.000Z', mods)
        const done = days.find((row) => row.day === day.key)?.reviews ?? 0
        const notes = countNotes(db)
        const { decks, inbox } = deckSummaries(db, window, session.newLimit)
        const nextDueAt = session.counts.total
          ? null
          : (db.query(
              "SELECT MIN(c.due) AS due FROM cards c JOIN notes n ON n.id = c.note_id WHERE c.state > 0 AND c.paused = 0 AND n.status = 'active' AND c.due > $now",
            ).get({ now: window.now }) as { due: string | null }).due
        return {
          day: day.key,
          due: session.counts,
          minutes: estimateMinutes(session.counts, averageDuration(db)),
          nextDueAt,
          drafts: notes.drafts,
          inbox: notes.inbox,
          goal: { target: settings.dailyGoal, done },
          streak: streak(days, day.key),
          decks,
          inboxDue: inbox.due,
          totals: { notes: notes.notes, cards: countCards(db) },
        }
      }),

    decks: () =>
      core.read((db, now) => {
        const session = sessionQueue(db, now, clock)
        return deckSummaries(db, session.window, session.newLimit)
      }),

    /** A page of notes. `rankedIds` (a meaning search) replaces the text match and the sort. */
    library: (query: LibraryQuery, rankedIds?: readonly string[]): LibraryPage =>
      core.read((db) => {
        const where = libraryWhere(query, rankedIds)
        const offset = query.offset ?? 0
        const limit = query.limit ?? 50
        const total = countWhere(db, where)
        const notes = pageWhere(db, where, query.sort ?? 'newest', offset, Math.min(limit, LIMITS.page), rankedIds)
        return {
          rows: rowsOf(db, notes),
          total,
          offset,
          limit,
          nextOffset: offset + notes.length < total ? offset + notes.length : null,
          by: rankedIds ? 'meaning' : 'text',
        }
      }),

    noteDetail: (id: string): NoteDetail =>
      core.read((db, now) => {
        const note = getNote(db, id)
        if (!note) throw notFound('card', 'Read recall_find_cards for the ids.')
        const scheduler = createScheduler(readSettings(db))
        const deck = note.deckId ? listDecks(db).find((d) => d.id === note.deckId) : undefined
        return {
          note,
          deck: ref(deck),
          cards: cardsOfNote(db, id).map((card) => ({ ...card, retrievability: scheduler.retrievability(card, now) })),
          history: historyOfNote(db, id),
        }
      }),

    stats: (query: { deckIds?: string[]; days?: number } = {}): Stats =>
      core.read((db, now) => {
        const settings = readSettings(db)
        const day = studyDay(now, settings.dayStartsAt, offset(now))
        const mods = sqlDayModifiers(settings.dayStartsAt, offset(now))
        const scope = filterClause({ deckIds: query.deckIds }, 's')
        const span = query.days ?? 30
        const per = dailySeries(perDay(db, addDays(day.key, -91) + 'T00:00:00.000Z', mods, scope), day.key, 90)
        const until = new Date(day.start.getTime() + span * 86_400_000).toISOString()
        const retained = reviewRetention(db, new Date(now.getTime() - 30 * 86_400_000).toISOString(), scope)
        const last30 = per.slice(-30)
        return {
          day: day.key,
          forecast: forecastSeries(forecastRows(db, until, mods, scope), day.key, span),
          perDay: per,
          retention: { actual: retentionOf(retained.correct, retained.total), target: settings.retention, reviews: retained.total },
          states: stateCounts(db, scope),
          hardest: rowsOf(db, orderedNotes(db, hardestNoteIds(db, scope))),
          time: {
            todayMs: per.at(-1)?.ms ?? 0,
            last30Ms: last30.reduce((sum, row) => sum + row.ms, 0),
            averageMs: averageDuration(db),
          },
          totals: { ...scopedTotals(db, scope), reviews: totalReviews(db, scope) },
        }
      }),

    heatmap: (weeks = 12): Heatmap =>
      core.read((db, now) => {
        const settings = readSettings(db)
        const day = studyDay(now, settings.dayStartsAt, offset(now))
        const mods = sqlDayModifiers(settings.dayStartsAt, offset(now))
        const days = perDay(db, addDays(day.key, -400) + 'T00:00:00.000Z', mods)
        return {
          cells: heatmap(days, day.key, settings.dailyGoal, weeks),
          streak: streak(days, day.key),
          goal: settings.dailyGoal,
          today: { day: day.key, reviews: days.find((row) => row.day === day.key)?.reviews ?? 0 },
        }
      }),

    settings: (): SettingsResult =>
      core.read((db) => {
        const settings = readSettings(db)
        const [low, mid, high] = dailyLoad(db, [intervalFactor(0.8), 1, intervalFactor(0.95)])
        const round = (load: number) => Math.round(load + settings.newPerDay)
        return { settings, estimates: { '0.8': round(low!), '0.9': round(mid!), '0.95': round(high!) } }
      }),

    /** Everything, for the JSON backup and the other export formats. */
    exportData: (): RecallExport =>
      core.read((db, now) => ({
        version: 1,
        exportedAt: now.toISOString(),
        decks: listDecks(db),
        notes: (db.query('SELECT * FROM notes ORDER BY created_at, id').all() as Parameters<typeof toNote>[0][]).map(toNote),
        cards: (db.query('SELECT * FROM cards ORDER BY note_id, variant').all() as CardRow[]).map(toCard),
        reviews: (db.query('SELECT * FROM reviews ORDER BY reviewed_at, rowid').all() as Parameters<typeof toReview>[0][]).map(
          toReview,
        ),
        settings: readSettings(db),
      })),
  }
}

function orderedNotes(db: Db, ids: readonly string[]): Note[] {
  const byId = new Map(notesByIds(db, ids).map((note) => [note.id, note]))
  return ids.flatMap((id) => byId.get(id) ?? [])
}
