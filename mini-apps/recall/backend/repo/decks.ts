import type { Deck } from '../../shared/model'
import type { Db } from '../db'
import { notBuried, studiable } from './filters'

/** Decks: SQL only. Names are unique without regard to case. */

interface DeckRow {
  id: string
  name: string
  description: string
  color: number
  created_at: string
}

const toDeck = (row: DeckRow): Deck => ({
  id: row.id,
  name: row.name,
  description: row.description,
  color: row.color,
  createdAt: row.created_at,
})

export function listDecks(db: Db): Deck[] {
  return (db.query('SELECT * FROM decks ORDER BY name COLLATE NOCASE').all() as DeckRow[]).map(toDeck)
}

export function getDeck(db: Db, id: string): Deck | null {
  const row = db.query('SELECT * FROM decks WHERE id = $id').get({ id }) as DeckRow | null
  return row ? toDeck(row) : null
}

export function deckByName(db: Db, name: string): Deck | null {
  const row = db.query('SELECT * FROM decks WHERE name = $name').get({ name: name.trim() }) as DeckRow | null
  return row ? toDeck(row) : null
}

export function insertDeck(db: Db, deck: Deck): void {
  db.query(
    `INSERT INTO decks (id, name, description, color, created_at)
     VALUES ($id, $name, $description, $color, $createdAt)`,
  ).run(deck)
}

export function updateDeck(db: Db, deck: Deck): void {
  db.query(
    'UPDATE decks SET name = $name, description = $description, color = $color WHERE id = $id',
  ).run({ id: deck.id, name: deck.name, description: deck.description, color: deck.color })
}

export function deleteDeck(db: Db, id: string): void {
  db.query('DELETE FROM decks WHERE id = $id').run({ id })
}

/** The next colour slot: the least used of 1..6. */
export function nextDeckColor(db: Db): number {
  const used = db.query('SELECT color, COUNT(*) AS n FROM decks GROUP BY color').all() as {
    color: number
    n: number
  }[]
  const counts = new Map(used.map((row) => [row.color, row.n]))
  let best = 1
  for (let color = 1; color <= 6; color += 1) {
    if ((counts.get(color) ?? 0) < (counts.get(best) ?? 0)) best = color
  }
  return best
}

export interface DeckCounts {
  deckId: string | null
  notes: number
  cards: number
  learning: number
  review: number
  fresh: number
  /** Notes waiting for the person to accept them. */
  drafts: number
  /** Cards of active notes the person paused. */
  paused: number
  /** When the soonest card of an active note that is in the schedule comes due. */
  nextDueAt: string | null
}

/**
 * Per deck (null = Inbox): notes, cards, and what is studiable now — learning due now, reviews
 * due today, new cards — over active notes, not paused or skipped, siblings of today's answers
 * left out. Each due count walks the `cards_queue` index range it needs, not every card.
 */
export function deckCounts(db: Db, at: { now: string; start: string; end: string }): DeckCounts[] {
  const rows = new Map<string | null, DeckCounts>()
  const row = (deckId: string | null) => {
    let found = rows.get(deckId)
    if (!found) {
      found = { deckId, notes: 0, cards: 0, learning: 0, review: 0, fresh: 0, drafts: 0, paused: 0, nextDueAt: null }
      rows.set(deckId, found)
    }
    return found
  }
  for (const size of db.query('SELECT deck_id AS deckId, COUNT(*) AS n FROM notes GROUP BY deck_id').all() as {
    deckId: string | null
    n: number
  }[]) {
    row(size.deckId).notes = size.n
  }
  // CROSS JOIN keeps cards as the outer loop: SQLite would otherwise walk every note per deck.
  for (const size of db
    .query('SELECT n.deck_id AS deckId, COUNT(*) AS n FROM cards c CROSS JOIN notes n ON n.id = c.note_id GROUP BY n.deck_id')
    .all() as { deckId: string | null; n: number }[]) {
    row(size.deckId).cards = size.n
  }
  for (const size of db
    .query("SELECT deck_id AS deckId, COUNT(*) AS n FROM notes WHERE status = 'draft' GROUP BY deck_id")
    .all() as { deckId: string | null; n: number }[]) {
    row(size.deckId).drafts = size.n
  }
  for (const size of db
    .query(
      "SELECT n.deck_id AS deckId, COUNT(*) AS n FROM cards c CROSS JOIN notes n ON n.id = c.note_id WHERE c.paused = 1 AND n.status = 'active' GROUP BY n.deck_id",
    )
    .all() as { deckId: string | null; n: number }[]) {
    row(size.deckId).paused = size.n
  }
  for (const size of db
    .query(
      "SELECT n.deck_id AS deckId, MIN(c.due) AS due FROM cards c CROSS JOIN notes n ON n.id = c.note_id WHERE c.paused = 0 AND c.state > 0 AND n.status = 'active' GROUP BY n.deck_id",
    )
    .all() as { deckId: string | null; due: string | null }[]) {
    row(size.deckId).nextDueAt = size.due
  }
  const due = (key: 'learning' | 'review' | 'fresh', where: string) => {
    const counts = db
      .query(
        `SELECT n.deck_id AS deckId, COUNT(*) AS n FROM cards c CROSS JOIN notes n ON n.id = c.note_id
         WHERE c.paused = 0 AND ${where} AND ${studiable} GROUP BY n.deck_id`,
      )
      .all(at) as { deckId: string | null; n: number }[]
    for (const count of counts) row(count.deckId)[key] = count.n
  }
  due('learning', 'c.state IN (1, 3) AND c.due <= $now')
  due('review', `c.state = 2 AND c.due < $end AND ${notBuried}`)
  due('fresh', `c.state = 0 AND ${notBuried}`)
  return [...rows.values()]
}
