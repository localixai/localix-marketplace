import { duplicateKey } from '../../shared/cloze'
import type { Note, NoteStatus } from '../../shared/model'
import type { Db } from '../db'
import { chunks, inList } from './filters'

/** Notes: SQL only. Tags are kept space-separated; `dup_key` is the exact-duplicate key. */

interface NoteRow {
  id: string
  deck_id: string | null
  kind: Note['kind']
  front: string
  back: string
  extra: string
  tags: string
  status: NoteStatus
  source: string
  created_at: string
  updated_at: string
}

export const toNote = (row: NoteRow): Note => ({
  id: row.id,
  deckId: row.deck_id,
  kind: row.kind,
  front: row.front,
  back: row.back,
  extra: row.extra,
  tags: row.tags ? row.tags.split(' ') : [],
  status: row.status,
  source: row.source,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const columns = (note: Note) => ({
  id: note.id,
  deckId: note.deckId,
  kind: note.kind,
  front: note.front,
  back: note.back,
  extra: note.extra,
  tags: note.tags.join(' '),
  status: note.status,
  source: note.source,
  dupKey: duplicateKey(note),
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
})

export function getNote(db: Db, id: string): Note | null {
  const row = db.query('SELECT * FROM notes WHERE id = $id').get({ id }) as NoteRow | null
  return row ? toNote(row) : null
}

/** The notes with these ids, in no particular order; unknown ids are left out. */
export function notesByIds(db: Db, ids: readonly string[]): Note[] {
  const out: Note[] = []
  for (const part of chunks(ids)) {
    const list = inList(part, 'i')
    out.push(
      ...(db.query(`SELECT * FROM notes WHERE id IN (${list.sql})`).all(list.params) as NoteRow[]).map(
        toNote,
      ),
    )
  }
  return out
}

export function insertNote(db: Db, note: Note): void {
  db.query(
    `INSERT INTO notes (id, deck_id, kind, front, back, extra, tags, status, source, dup_key, created_at, updated_at)
     VALUES ($id, $deckId, $kind, $front, $back, $extra, $tags, $status, $source, $dupKey, $createdAt, $updatedAt)`,
  ).run(columns(note))
}

export function updateNote(db: Db, note: Note): void {
  const { createdAt: _created, source: _source, ...rest } = columns(note)
  db.query(
    `UPDATE notes SET deck_id = $deckId, kind = $kind, front = $front, back = $back, extra = $extra,
       tags = $tags, status = $status, dup_key = $dupKey, updated_at = $updatedAt WHERE id = $id`,
  ).run(rest)
}

export function deleteNotes(db: Db, ids: readonly string[]): number {
  let removed = 0
  for (const part of chunks(ids)) {
    const list = inList(part, 'i')
    removed += db.query(`DELETE FROM notes WHERE id IN (${list.sql})`).run(list.params).changes
  }
  return removed
}

/** Notes whose exact-duplicate key is one of these, with their deck's name. */
export function notesWithKeys(
  db: Db,
  keys: readonly string[],
): { id: string; key: string; front: string; deck: string | null }[] {
  const out: { id: string; key: string; front: string; deck: string | null }[] = []
  for (const part of chunks([...new Set(keys)].filter(Boolean))) {
    const list = inList(part, 'k')
    out.push(
      ...(db
        .query(
          `SELECT n.id, n.dup_key AS key, n.front, d.name AS deck FROM notes n
           LEFT JOIN decks d ON d.id = n.deck_id WHERE n.dup_key IN (${list.sql})`,
        )
        .all(list.params) as { id: string; key: string; front: string; deck: string | null }[]),
    )
  }
  return out
}

export function countNotes(db: Db): { notes: number; drafts: number; inbox: number } {
  return db
    .query(
      `SELECT COUNT(*) AS notes,
        COALESCE(SUM(status = 'draft'), 0) AS drafts,
        COALESCE(SUM(deck_id IS NULL AND status = 'active'), 0) AS inbox
       FROM notes`,
    )
    .get() as { notes: number; drafts: number; inbox: number }
}

/** Ids of notes matching a clause on `n`, oldest first, at most `limit`. */
export function noteIdsWhere(db: Db, where: string, params: Record<string, string | number | null>, limit: number): string[] {
  return (
    db
      .query(`SELECT n.id FROM notes n WHERE ${where} ORDER BY n.created_at, n.id LIMIT $limit`)
      .all({ ...params, limit }) as { id: string }[]
  ).map((row) => row.id)
}

/** Every distinct tag in use, most used first, at most `limit`. */
export function tagsInUse(db: Db, limit = 300): { tag: string; count: number }[] {
  return db
    .query(
      `WITH RECURSIVE split(tag, rest) AS (
         SELECT '', tags || ' ' FROM notes WHERE tags <> ''
         UNION ALL
         SELECT substr(rest, 1, instr(rest, ' ') - 1), substr(rest, instr(rest, ' ') + 1)
         FROM split WHERE rest <> ''
       )
       SELECT tag, COUNT(*) AS count FROM split WHERE tag <> ''
       GROUP BY tag ORDER BY count DESC, tag LIMIT $limit`,
    )
    .all({ limit }) as { tag: string; count: number }[]
}
