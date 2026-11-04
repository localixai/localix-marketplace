import type { Card, CardSnapshot } from '../../shared/model'
import type { Db } from '../db'
import { chunks, inList } from './filters'

/** Cards: SQL only. A card's memory columns mirror `Memory`; flags are 0/1. */

export interface CardRow {
  id: string
  note_id: string
  variant: string
  due: string
  stability: number
  difficulty: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review: string | null
  paused: number
  skip_until: string | null
  leech: number
}

export const toCard = (row: CardRow): Card => ({
  id: row.id,
  noteId: row.note_id,
  variant: row.variant,
  due: row.due,
  stability: row.stability,
  difficulty: row.difficulty,
  scheduledDays: row.scheduled_days,
  learningSteps: row.learning_steps,
  reps: row.reps,
  lapses: row.lapses,
  state: row.state,
  lastReview: row.last_review,
  paused: row.paused === 1,
  skipUntil: row.skip_until,
  leech: row.leech === 1,
})

/** The card's state for undo and history. */
export function snapshotOf(card: Card): CardSnapshot {
  const { id: _id, noteId: _note, variant: _variant, ...snapshot } = card
  return snapshot
}

const snapshotParams = (snapshot: CardSnapshot) => ({
  due: snapshot.due,
  stability: snapshot.stability,
  difficulty: snapshot.difficulty,
  scheduledDays: snapshot.scheduledDays,
  learningSteps: snapshot.learningSteps,
  reps: snapshot.reps,
  lapses: snapshot.lapses,
  state: snapshot.state,
  lastReview: snapshot.lastReview,
  paused: snapshot.paused ? 1 : 0,
  skipUntil: snapshot.skipUntil,
  leech: snapshot.leech ? 1 : 0,
})

export function getCard(db: Db, id: string): Card | null {
  const row = db.query('SELECT * FROM cards WHERE id = $id').get({ id }) as CardRow | null
  return row ? toCard(row) : null
}

/** The cards of these notes, grouped by note, each note's in variant order. */
export function cardsOfNotes(db: Db, noteIds: readonly string[]): Map<string, Card[]> {
  const byNote = new Map<string, Card[]>()
  for (const part of chunks(noteIds)) {
    const list = inList(part, 'n')
    const rows = db
      .query(`SELECT * FROM cards WHERE note_id IN (${list.sql}) ORDER BY note_id, variant`)
      .all(list.params) as CardRow[]
    for (const row of rows) {
      const card = toCard(row)
      byNote.set(card.noteId, [...(byNote.get(card.noteId) ?? []), card])
    }
  }
  return byNote
}

export function cardsOfNote(db: Db, noteId: string): Card[] {
  return cardsOfNotes(db, [noteId]).get(noteId) ?? []
}

export function insertCard(db: Db, card: Card, createdAt: string): void {
  db.query(
    `INSERT INTO cards (id, note_id, variant, due, stability, difficulty, scheduled_days,
       learning_steps, reps, lapses, state, last_review, paused, skip_until, leech, created_at)
     VALUES ($id, $noteId, $variant, $due, $stability, $difficulty, $scheduledDays,
       $learningSteps, $reps, $lapses, $state, $lastReview, $paused, $skipUntil, $leech, $createdAt)`,
  ).run({ id: card.id, noteId: card.noteId, variant: card.variant, createdAt, ...snapshotParams(card) })
}

/** Write a card's whole state (memory and flags). */
export function writeSnapshot(db: Db, id: string, snapshot: CardSnapshot): void {
  db.query(
    `UPDATE cards SET due = $due, stability = $stability, difficulty = $difficulty,
       scheduled_days = $scheduledDays, learning_steps = $learningSteps, reps = $reps,
       lapses = $lapses, state = $state, last_review = $lastReview, paused = $paused,
       skip_until = $skipUntil, leech = $leech WHERE id = $id`,
  ).run({ id, ...snapshotParams(snapshot) })
}

export function deleteCards(db: Db, ids: readonly string[]): void {
  for (const part of chunks(ids)) {
    const list = inList(part, 'c')
    db.query(`DELETE FROM cards WHERE id IN (${list.sql})`).run(list.params)
  }
}

/** Set a flag column on every card of these notes; answers how many cards changed. */
export function setOnNotes(
  db: Db,
  noteIds: readonly string[],
  set: 'paused = 1' | 'paused = 0' | 'skip_until = $until',
  until: string | null = null,
): number {
  let changed = 0
  for (const part of chunks(noteIds)) {
    const list = inList(part, 'n')
    const params = set.includes('$until') ? { ...list.params, until } : list.params
    changed += db.query(`UPDATE cards SET ${set} WHERE note_id IN (${list.sql})`).run(params).changes
  }
  return changed
}

/** The card ids of these notes. */
export function cardIdsOfNotes(db: Db, noteIds: readonly string[]): string[] {
  return [...cardsOfNotes(db, noteIds).values()].flat().map((card) => card.id)
}

/** How many cards there are. */
export function countCards(db: Db): number {
  return (db.query('SELECT COUNT(*) AS n FROM cards').get() as { n: number }).n
}
