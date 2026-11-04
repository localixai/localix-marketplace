import { cardFaces } from '../shared/cloze'
import { studyDay, type Clock } from '../shared/day'
import { formatInterval } from '../shared/format'
import type { CardFilter, Rating, Review, ReviewSource, Settings } from '../shared/model'
import type { GradeResult, StudyCard, StudyNext } from '../shared/payloads'
import { buildQueue, countQueue, type QueueEntry, type QueueKind } from '../shared/queue'
import { createScheduler, LEECH_LAPSES } from '../shared/scheduler'
import type { Db } from './db'
import { invalid, notFound, RecallError } from './errors'
import { getCard, snapshotOf, writeSnapshot } from './repo/cards'
import { getDeck } from './repo/decks'
import { getNote } from './repo/notes'
import { dueReviewCount, hasFresh, learnAhead, nextDue, queueCandidates, type QueueWindow } from './repo/queue'
import { deleteReview, hasLaterReview, insertReview, lastReview, newCardsSince } from './repo/reviews'
import { readSettings } from './repo/settings'
import type { Core } from './service'

/**
 * Studying: the session queue, the card shown, and grade / undo / pause / skip. A review is one
 * transaction: the card's new state and its log row (with the state before, for undo).
 */

const REVIEW_CAP = 500
const MAX_STORED_MS = 60_000
const CARD_IDS = 'Read recall_next_card or recall_find_cards for card ids.'

export function queueWindow(now: Date, settings: Settings, clock: Clock): QueueWindow {
  const day = studyDay(now, settings.dayStartsAt, clock.utcOffset(now))
  return { now: now.toISOString(), start: day.start.toISOString(), end: day.end.toISOString() }
}

export interface Session {
  queue: QueueEntry[]
  counts: ReturnType<typeof countQueue>
  window: QueueWindow
  newLimit: number
  settings: Settings
}

/** The session's queue now: SQL candidates, ordered and trimmed by `buildQueue`. */
export function sessionQueue(db: Db, now: Date, clock: Clock, filter?: CardFilter): Session {
  const settings = readSettings(db)
  const window = queueWindow(now, settings, clock)
  const newLimit = Math.max(0, settings.newPerDay - newCardsSince(db, window.start))
  const candidates = queueCandidates(db, window, filter, { review: REVIEW_CAP, fresh: newLimit ? newLimit + 50 : 0 })
  let queue = buildQueue({ ...candidates, newLimit })
  if (!queue.length) {
    const ahead = learnAhead(db, window, filter)
    if (ahead) queue = [{ ...ahead, kind: 'learning' }]
  }
  const counts = countQueue(queue)
  if (candidates.review.length === REVIEW_CAP) {
    const more = dueReviewCount(db, window, filter) - REVIEW_CAP
    if (more > 0) {
      counts.review += more
      counts.total += more
    }
  }
  return { queue, counts, window, newLimit, settings }
}

function kindOf(state: number): QueueKind {
  return state === 0 ? 'new' : state === 2 ? 'review' : 'learning'
}

/** A card as the study view shows it, with its four outcomes from now. */
export function studyCardOf(db: Db, cardId: string, now: Date, settings: Settings, kind?: QueueKind): StudyCard | null {
  const card = getCard(db, cardId)
  const note = card && getNote(db, card.noteId)
  if (!card || !note) return null
  const deck = note.deckId ? getDeck(db, note.deckId) : null
  const faces = cardFaces(note, card.variant)
  const preview = createScheduler(settings).preview(card, now)
  const outcome = (rating: Rating) => ({ ...preview[rating], label: formatInterval(preview[rating].intervalMs) })
  const cloze = /^c(\d+)$/.exec(card.variant)
  return {
    kind: kind ?? kindOf(card.state),
    card,
    note,
    deck: deck ? { id: deck.id, name: deck.name, color: deck.color } : null,
    prompt: faces.prompt,
    answer: faces.answer,
    expected: faces.expected,
    extra: faces.extra,
    cloze: note.kind === 'cloze' && cloze ? Number(cloze[1]) : null,
    typed: note.kind === 'typed',
    outcomes: { '1': outcome(1), '2': outcome(2), '3': outcome(3), '4': outcome(4) },
  }
}

function reviewedSince(db: Db, start: string): number {
  return (
    db.query("SELECT COUNT(*) AS n FROM reviews WHERE reviewed_at >= $start AND source <> 'import'").get({ start }) as {
      n: number
    }
  ).n
}

/** What to study next, with what is left. */
export function nextOf(db: Db, now: Date, clock: Clock, filter?: CardFilter): StudyNext {
  const session = sessionQueue(db, now, clock, filter)
  const first = session.queue[0]
  const card = first ? studyCardOf(db, first.cardId, now, session.settings, first.kind) : null
  let nextDueAt: string | null = null
  if (!card) {
    nextDueAt = nextDue(db, session.window, filter)
    if (session.newLimit === 0 && hasFresh(db, session.window, filter)) {
      const tomorrow = session.window.end
      if (!nextDueAt || tomorrow < nextDueAt) nextDueAt = tomorrow
    }
  }
  return { card, counts: session.counts, nextDueAt, reviewedToday: reviewedSince(db, session.window.start) }
}

export function studyOps(core: Core) {
  const { clock } = core
  return {
    studyNext: (filter?: CardFilter) => core.read((db, now) => nextOf(db, now, clock, filter)),

    studyQueue: (filter?: CardFilter) =>
      core.read((db, now) => {
        const session = sessionQueue(db, now, clock, filter)
        return {
          entries: session.queue.map(({ cardId, noteId, kind }) => ({ cardId, noteId, kind })),
          counts: session.counts,
        }
      }),

    studyCard: (cardId: string) =>
      core.read((db, now) => {
        const card = studyCardOf(db, cardId, now, readSettings(db))
        if (!card) throw notFound('card', CARD_IDS)
        return card
      }),

    /** Grade a card: its new state and the log row in one transaction, then what is next. */
    async gradeCard(input: {
      cardId: string
      rating: Rating
      durationMs?: number
      source: ReviewSource
      filter?: CardFilter
    }): Promise<GradeResult> {
      const graded = await core.write((db, now) => {
        const card = getCard(db, input.cardId)
        const note = card && getNote(db, card.noteId)
        if (!card || !note) throw notFound('card', CARD_IDS)
        if (note.status === 'draft') throw invalid('That card is a draft: accept it before studying it.')
        const settings = readSettings(db)
        const { memory, log } = createScheduler(settings).grade(card, input.rating, now)
        const becameHard = !card.leech && memory.lapses >= LEECH_LAPSES
        const snapshot = { ...memory, paused: card.paused, skipUntil: null, leech: card.leech || becameHard }
        writeSnapshot(db, card.id, snapshot)
        const review: Review = {
          id: crypto.randomUUID(),
          cardId: card.id,
          noteId: card.noteId,
          ...log,
          durationMs: Math.min(MAX_STORED_MS, Math.max(0, Math.round(input.durationMs ?? 0))),
          source: input.source,
          prev: snapshotOf(card),
        }
        insertReview(db, review)
        return { review, becameHard, label: formatInterval(Date.parse(memory.due) - now.getTime()) }
      })
      const next = core.read((db, now) => nextOf(db, now, clock, input.filter))
      return { ...graded, next }
    },

    /** Undo the last answer from this source: the card goes back exactly as it was. */
    async undoLast(source: ReviewSource = 'screen') {
      const undone = await core.write((db) => {
        const review = lastReview(db, source)
        if (!review) return null
        if (!review.prev) throw new RecallError('conflict', 'That answer cannot be undone.')
        if (hasLaterReview(db, review)) {
          throw new RecallError('conflict', 'That card was answered again since; nothing was undone.')
        }
        if (!getCard(db, review.cardId)) throw new RecallError('conflict', 'That card is gone.')
        writeSnapshot(db, review.cardId, review.prev)
        deleteReview(db, review.id)
        return { cardId: review.cardId, rating: review.rating }
      })
      if (!undone) return { card: null, undone: null }
      const card = core.read((db, now) => studyCardOf(db, undone.cardId, now, readSettings(db)))
      return { card, undone }
    },

    /** Pause one card (it leaves every queue until resumed), then what is next. */
    pauseCard: (cardId: string, filter?: CardFilter) => setCardFlag(core, cardId, 'pause', filter),
    /** Skip one card until the next study day, then what is next. */
    skipCard: (cardId: string, filter?: CardFilter) => setCardFlag(core, cardId, 'skip', filter),
  }
}

async function setCardFlag(core: Core, cardId: string, flag: 'pause' | 'skip', filter?: CardFilter) {
  await core.write((db, now) => {
    const card = getCard(db, cardId)
    if (!card) throw notFound('card', CARD_IDS)
    const until = queueWindow(now, readSettings(db), core.clock).end
    writeSnapshot(db, card.id, flag === 'pause' ? { ...card, paused: true } : { ...card, skipUntil: until })
  })
  return core.read((db, now) => nextOf(db, now, core.clock, filter))
}
