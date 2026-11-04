import type { StateCounts } from '../../shared/stats'
import type { Db } from '../db'
import type { Clause } from './filters'

/** Aggregates for Stats and Settings: grouped scans, never a row per card to the caller. */

/** Cards due per study day from now on (`modifiers` as in `perDay`), overdue ones on their day. */
export function forecastRows(
  db: Db,
  until: string,
  modifiers: [string, string],
  scope: Clause,
): { day: string; count: number }[] {
  return db
    .query(
      `SELECT date(c.due, $m1, $m2) AS day, COUNT(*) AS count
       FROM cards c JOIN notes n ON n.id = c.note_id
       WHERE c.state IN (1, 2, 3) AND c.paused = 0 AND n.status = 'active' AND c.due < $until AND ${scope.sql}
       GROUP BY day ORDER BY day`,
    )
    .all({ ...scope.params, until, m1: modifiers[0], m2: modifiers[1] }) as { day: string; count: number }[]
}

export function stateCounts(db: Db, scope: Clause): StateCounts {
  return db
    .query(
      `SELECT
         COALESCE(SUM(n.status = 'active' AND c.paused = 0 AND c.state = 0), 0) AS new,
         COALESCE(SUM(n.status = 'active' AND c.paused = 0 AND c.state IN (1, 3)), 0) AS learning,
         COALESCE(SUM(n.status = 'active' AND c.paused = 0 AND c.state = 2 AND c.scheduled_days < 21), 0) AS young,
         COALESCE(SUM(n.status = 'active' AND c.paused = 0 AND c.state = 2 AND c.scheduled_days >= 21), 0) AS mature,
         COALESCE(SUM(n.status = 'active' AND c.paused = 1), 0) AS paused,
         COALESCE(SUM(c.leech = 1), 0) AS hard,
         COALESCE(SUM(n.status = 'draft'), 0) AS drafts
       FROM cards c JOIN notes n ON n.id = c.note_id WHERE ${scope.sql}`,
    )
    .get(scope.params) as StateCounts
}

/** Note ids of the cards with the most lapses (at least one), most first. */
export function hardestNoteIds(db: Db, scope: Clause, limit = 10): string[] {
  return (
    db
      .query(
        `SELECT c.note_id AS id, MAX(c.lapses) AS lapses FROM cards c JOIN notes n ON n.id = c.note_id
         WHERE c.lapses > 0 AND ${scope.sql}
         GROUP BY c.note_id ORDER BY lapses DESC, MAX(c.difficulty) DESC LIMIT $limit`,
      )
      .all({ ...scope.params, limit }) as { id: string }[]
  ).map((row) => row.id)
}

/** Share remembered of answers to review cards since `since` (the card was in review before). */
export function reviewRetention(db: Db, since: string, scope: Clause): { correct: number; total: number } {
  const join = scope.sql === '1' ? '' : 'JOIN notes n ON n.id = r.note_id'
  return db
    .query(
      `SELECT COALESCE(SUM(r.rating > 1), 0) AS correct, COUNT(*) AS total FROM reviews r ${join}
       WHERE r.reviewed_at >= $since AND json_extract(r.prev, '$.state') = 2 AND ${scope.sql}`,
    )
    .get({ ...scope.params, since }) as { correct: number; total: number }
}

export function totalReviews(db: Db, scope: Clause): number {
  const join = scope.sql === '1' ? '' : 'JOIN notes n ON n.id = r.note_id'
  return (db.query(`SELECT COUNT(*) AS n FROM reviews r ${join} WHERE ${scope.sql}`).get(scope.params) as {
    n: number
  }).n
}

export function scopedTotals(db: Db, scope: Clause): { notes: number; cards: number } {
  return db
    .query(
      `SELECT COUNT(DISTINCT n.id) AS notes, COUNT(c.id) AS cards
       FROM notes n LEFT JOIN cards c ON c.note_id = n.id WHERE ${scope.sql}`,
    )
    .get(scope.params) as { notes: number; cards: number }
}

/**
 * About how many reviews a day the review cards need at each interval factor: each card comes
 * back once per interval, its interval being its stability times the factor.
 */
export function dailyLoad(db: Db, factors: readonly number[]): number[] {
  return factors.map(
    (factor) =>
      (
        db
          .query(
            `SELECT COALESCE(SUM(1.0 / MAX(1.0, c.stability * $factor)), 0) AS load
             FROM cards c JOIN notes n ON n.id = c.note_id
             WHERE c.state = 2 AND c.paused = 0 AND n.status = 'active'`,
          )
          .get({ factor }) as { load: number }
      ).load,
  )
}
