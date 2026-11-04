import { Database } from 'bun:sqlite'
import { ImportError } from './common'
import { protoNumber, readProto } from './protobuf'

/**
 * Reads an Anki collection database (any schema: the old one keeps note types and decks as JSON in
 * `col`, the new one in tables) into plain values. The file is untrusted: it is opened read-only and
 * every column is read as data.
 */

export interface NoteType {
  name: string
  cloze: boolean
  fields: number
  templates: number
}
export interface AnkiNote {
  id: number
  mid: number
  tags: string
  fields: string[]
}
export interface AnkiCard {
  id: number
  nid: number
  did: number
  ord: number
  queue: number
}
export interface AnkiCollection {
  noteTypes: Map<number, NoteType>
  decks: Map<number, { name: string; description: string }>
  notes: AnkiNote[]
  cards: AnkiCard[]
}
export interface AnkiReview {
  cid: number
  at: number
  ease: number
  time: number
}

type Row = Record<string, unknown>

const text = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value))
const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value) || 0)

function json(value: unknown): Record<string, Row> {
  try {
    const parsed: unknown = JSON.parse(text(value) || '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Row>) : {}
  } catch {
    return {}
  }
}

function hasTable(db: Database, name: string): boolean {
  return db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== null
}

/** Anki 2.1.28+ writes a deck path's `::` as a unit separator in the `decks` table. */
const deckPath = (name: string) => name.replaceAll('\u001f', '::')

function readNoteTypes(db: Database): Map<number, NoteType> {
  const types = new Map<number, NoteType>()
  if (!hasTable(db, 'notetypes')) {
    const col = db.query('SELECT models FROM col').get() as Row | null
    for (const [id, model] of Object.entries(json(col?.models))) {
      types.set(Number(id), {
        name: text(model.name),
        cloze: num(model.type) === 1,
        fields: Array.isArray(model.flds) ? model.flds.length : 0,
        templates: Array.isArray(model.tmpls) ? model.tmpls.length : 0,
      })
    }
    return types
  }
  const count = (table: string) => {
    const counts = new Map<number, number>()
    for (const row of db.query(`SELECT ntid, COUNT(*) AS n FROM ${table} GROUP BY ntid`).all() as Row[]) {
      counts.set(num(row.ntid), num(row.n))
    }
    return counts
  }
  const fields = count('fields')
  const templates = count('templates')
  for (const row of db.query('SELECT id, name, config FROM notetypes').all() as Row[]) {
    const config = row.config instanceof Uint8Array ? readProto(row.config) : new Map()
    const id = num(row.id)
    types.set(id, {
      name: text(row.name),
      cloze: protoNumber(config, 1) === 1,
      fields: fields.get(id) ?? 0,
      templates: templates.get(id) ?? 0,
    })
  }
  return types
}

function readDecks(db: Database): AnkiCollection['decks'] {
  const decks: AnkiCollection['decks'] = new Map()
  if (!hasTable(db, 'decks')) {
    const col = db.query('SELECT decks FROM col').get() as Row | null
    for (const [id, deck] of Object.entries(json(col?.decks))) {
      decks.set(Number(id), { name: deckPath(text(deck.name)), description: text(deck.desc) })
    }
    return decks
  }
  for (const row of db.query('SELECT id, name FROM decks').all() as Row[]) {
    decks.set(num(row.id), { name: deckPath(text(row.name)), description: '' })
  }
  return decks
}

export function readCollection(db: Database): AnkiCollection {
  try {
    db.run('PRAGMA trusted_schema = OFF')
    const notes = (db.query('SELECT id, mid, tags, flds FROM notes').all() as Row[]).map((row) => ({
      id: num(row.id),
      mid: num(row.mid),
      tags: text(row.tags),
      fields: text(row.flds).split('\u001f'),
    }))
    const cards = (db.query('SELECT id, nid, did, odid, ord, queue FROM cards ORDER BY nid, ord').all() as Row[]).map(
      (row) => ({
        id: num(row.id),
        nid: num(row.nid),
        // A card in a filtered deck belongs to the deck it came from.
        did: num(row.odid) || num(row.did),
        ord: num(row.ord),
        queue: num(row.queue),
      }),
    )
    return { noteTypes: readNoteTypes(db), decks: readDecks(db), notes, cards }
  } catch (error) {
    throw new ImportError('The file does not hold a readable Anki collection.', { cause: error })
  }
}

/** Real answers in time order: manual entries (type 4+) and rows without an answer button are not. */
export function* readReviews(db: Database): Generator<AnkiReview> {
  try {
    const query = db.query('SELECT id, cid, ease, time FROM revlog WHERE ease BETWEEN 1 AND 4 AND type < 4 ORDER BY id')
    for (const row of query.iterate() as Iterable<Row>) {
      yield { cid: num(row.cid), at: num(row.id), ease: num(row.ease), time: num(row.time) }
    }
  } catch {
    // A collection without a review log has no progress to keep.
  }
}
