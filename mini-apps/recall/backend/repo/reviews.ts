import { cardSnapshotSchema, type Review } from '../../shared/model'
import type { DayCount } from '../../shared/stats'
import type { Db } from '../db'
import { chunks, inList, type Clause } from './filters'

/** The review log: SQL only. A row's figures are what the review produced; `prev` the card before. */

interface ReviewRow {
  id: string
  card_id: string
  note_id: string
  rating: number
  state: number
  due: string
  stability: number
  difficulty: number
  scheduled_days: number
  elapsed_days: number
  reviewed_at: string
  duration_ms: number
  source: Review['source']
  prev: string | null
}

function parsePrev(text: string | null): Review['prev'] {
  if (!text) return null
  try {
    const parsed = cardSnapshotSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export const toReview = (row: ReviewRow): Review => ({
  id: row.id,
  cardId: row.card_id,
  noteId: row.note_id,
  rating: row.rating as Review['rating'],
  state: row.state,
  due: row.due,
  stability: row.stability,
  difficulty: row.difficulty,
  scheduledDays: row.scheduled_days,
  elapsedDays: row.elapsed_days,
  reviewedAt: row.reviewed_at,
  durationMs: row.duration_ms,
  source: row.source,
  prev: parsePrev(row.prev),
})

export function insertReview(db: Db, review: Review): void {
  db.query(
    `INSERT INTO reviews (id, card_id, note_id, rating, state, due, stability, difficulty,
       scheduled_days, elapsed_days, reviewed_at, duration_ms, source, prev)
     VALUES ($id, $cardId, $noteId, $rating, $state, $due, $stability, $difficulty,
       $scheduledDays, $elapsedDays, $reviewedAt, $durationMs, $source, $prev)`,
  ).run({ ...review, prev: review.prev ? JSON.stringify(review.prev) : null })
}

/** The newest review from this source, or null. */
export function lastReview(db: Db, source: Review['source']): Review | null {
  const row = db
    .query('SELECT * FROM reviews WHERE source = $source ORDER BY reviewed_at DESC, rowid DESC LIMIT 1')
    .get({ source }) as ReviewRow | null
  return row ? toReview(row) : null
}

/** Whether the card has a review after this one. */
export function hasLaterReview(db: Db, review: Review): boolean {
  return !!db
    .query(
      `SELECT 1 FROM reviews WHERE card_id = $cardId AND id <> $id
       AND (reviewed_at > $at OR (reviewed_at = $at AND rowid > (SELECT rowid FROM reviews WHERE id = $id)))
       LIMIT 1`,
    )
    .get({ cardId: review.cardId, id: review.id, at: review.reviewedAt })
}

export function deleteReview(db: Db, id: string): void {
  db.query('DELETE FROM reviews WHERE id = $id').run({ id })
}

export function deleteReviewsOfCards(db: Db, cardIds: readonly string[]): void {
  for (const part of chunks(cardIds)) {
    const list = inList(part, 'c')
    db.query(`DELETE FROM reviews WHERE card_id IN (${list.sql})`).run(list.params)
  }
}

/** A note's reviews, newest first. */
export function historyOfNote(db: Db, noteId: string, limit = 100): Review[] {
  return (
    db
      .query('SELECT * FROM reviews WHERE note_id = $noteId ORDER BY reviewed_at DESC, rowid DESC LIMIT $limit')
      .all({ noteId, limit }) as ReviewRow[]
  ).map(toReview)
}

/** Every review of these cards, oldest first: for exports and rebuilds. */
export function reviewsOfCards(db: Db, cardIds: readonly string[]): Review[] {
  const out: Review[] = []
  for (const part of chunks(cardIds)) {
    const list = inList(part, 'c')
    out.push(
      ...(db
        .query(`SELECT * FROM reviews WHERE card_id IN (${list.sql}) ORDER BY reviewed_at, rowid`)
        .all(list.params) as ReviewRow[]).map(toReview),
    )
  }
  return out
}

/** How many cards were seen for the first time since `start` (new cards introduced today). */
export function newCardsSince(db: Db, start: string): number {
  return (
    db
      .query(
        `SELECT COUNT(DISTINCT card_id) AS n FROM reviews
         WHERE reviewed_at >= $start AND source <> 'import' AND json_extract(prev, '$.state') = 0`,
      )
      .get({ start }) as { n: number }
  ).n
}

/**
 * Reviews per study day since `since`: count, correct, time. `modifiers` turn a UTC time into its
 * study-day key (`sqlDayModifiers`); `scope` limits to notes (`n`) by deck.
 */
export function perDay(
  db: Db,
  since: string,
  modifiers: [string, string],
  scope: Clause = { sql: '1', params: {} },
): DayCount[] {
  const join = scope.sql === '1' ? '' : 'JOIN notes n ON n.id = r.note_id'
  return db
    .query(
      `SELECT date(r.reviewed_at, $m1, $m2) AS day, COUNT(*) AS reviews,
         COALESCE(SUM(r.rating > 1), 0) AS correct, COALESCE(SUM(r.duration_ms), 0) AS ms
       FROM reviews r ${join}
       WHERE r.reviewed_at >= $since AND ${scope.sql}
       GROUP BY day ORDER BY day`,
    )
    .all({ ...scope.params, since, m1: modifiers[0], m2: modifiers[1] }) as DayCount[]
}

/** The average time on a card over the latest 500 timed answers, or null. */
export function averageDuration(db: Db): number | null {
  const row = db
    .query(
      `SELECT AVG(duration_ms) AS ms FROM (SELECT duration_ms FROM reviews
       WHERE duration_ms > 0 ORDER BY reviewed_at DESC LIMIT 500)`,
    )
    .get() as { ms: number | null }
  return row.ms === null ? null : Math.round(row.ms)
}
