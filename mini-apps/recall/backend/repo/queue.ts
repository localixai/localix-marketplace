import type { CardFilter } from '../../shared/model'
import type { QueueCandidate } from '../../shared/queue'
import type { Db } from '../db'
import { filterClause, notBuried, studiable } from './filters'

/**
 * The queue's candidates, picked in SQL over the `cards_queue` index (paused, state, due); the
 * pure `buildQueue` orders and trims them. Reviews come most overdue first: the elapsed time over
 * stability is the order of falling retrievability for every card at once. `CROSS JOIN` keeps the
 * card index range as the outer loop.
 */

export interface QueueWindow {
  now: string
  /** Today's study day. */
  start: string
  end: string
}

const LEARN_AHEAD_MS = 20 * 60_000

function select(db: Db, where: string, order: string, limit: number, window: QueueWindow, filter?: CardFilter) {
  const scope = filterClause(filter)
  return db
    .query(
      `SELECT c.id AS cardId, c.note_id AS noteId, c.due AS due
       FROM cards c CROSS JOIN notes n ON n.id = c.note_id
       WHERE ${where} AND ${studiable} AND ${scope.sql}
       ORDER BY ${order} LIMIT $limit`,
    )
    .all({ ...scope.params, ...window, limit }) as QueueCandidate[]
}

export interface Candidates {
  learning: QueueCandidate[]
  review: QueueCandidate[]
  fresh: QueueCandidate[]
}

/** Learning due now, reviews due today, and new cards, each capped. */
export function queueCandidates(
  db: Db,
  window: QueueWindow,
  filter: CardFilter | undefined,
  caps: { review: number; fresh: number },
): Candidates {
  const learning = select(db, 'c.state IN (1, 3) AND c.due <= $now', 'c.due', 1000, window, filter)
  const review = select(
    db,
    `c.state = 2 AND c.due < $end AND ${notBuried}`,
    `(julianday($now) - julianday(COALESCE(c.last_review, c.due))) / MAX(c.stability, 0.01) DESC, c.due`,
    caps.review,
    window,
    filter,
  )
  const fresh =
    caps.fresh > 0
      ? select(db, `c.state = 0 AND ${notBuried}`, 'c.due, c.note_id, c.variant', caps.fresh, window, filter)
      : []
  return { learning, review, fresh }
}

/** A learning card due within the learn-ahead window, for when nothing else is left. */
export function learnAhead(db: Db, window: QueueWindow, filter?: CardFilter): QueueCandidate | null {
  const ahead = { ...window, now: new Date(Date.parse(window.now) + LEARN_AHEAD_MS).toISOString() }
  // `studiable` compares skip_until with $now: keep it on the real now.
  const scope = filterClause(filter)
  const row = db
    .query(
      `SELECT c.id AS cardId, c.note_id AS noteId, c.due AS due
       FROM cards c CROSS JOIN notes n ON n.id = c.note_id
       WHERE c.state IN (1, 3) AND c.due <= $ahead AND ${studiable} AND ${scope.sql}
       ORDER BY c.due LIMIT 1`,
    )
    .get({ ...scope.params, now: window.now, ahead: ahead.now }) as QueueCandidate | null
  return row
}

/** How many reviews are due today, beyond the capped candidate list. */
export function dueReviewCount(db: Db, window: QueueWindow, filter?: CardFilter): number {
  const scope = filterClause(filter)
  return (
    db
      .query(
        `SELECT COUNT(*) AS n FROM cards c CROSS JOIN notes n ON n.id = c.note_id
         WHERE c.paused = 0 AND c.state = 2 AND c.due < $end AND ${notBuried} AND ${studiable} AND ${scope.sql}`,
      )
      .get({ ...scope.params, ...window }) as { n: number }
  ).n
}

/** Whether any new card waits (for "next card tomorrow" once today's new limit is used). */
export function hasFresh(db: Db, window: QueueWindow, filter?: CardFilter): boolean {
  const scope = filterClause(filter)
  return !!db
    .query(
      `SELECT 1 FROM cards c CROSS JOIN notes n ON n.id = c.note_id
       WHERE c.paused = 0 AND c.state = 0 AND ${studiable} AND ${scope.sql} LIMIT 1`,
    )
    .get({ ...scope.params, ...window })
}

/** When the next card after now falls due (learning later, or a review on a later day). */
export function nextDue(db: Db, window: QueueWindow, filter?: CardFilter): string | null {
  const scope = filterClause(filter)
  const row = db
    .query(
      `SELECT MIN(c.due) AS due FROM cards c CROSS JOIN notes n ON n.id = c.note_id
       WHERE c.state IN (1, 2, 3) AND c.due > $now AND n.status = 'active' AND c.paused = 0
       AND ${scope.sql}`,
    )
    .get({ ...scope.params, now: window.now }) as { due: string | null }
  return row.due
}
