import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The SQLite file `recall.db` in the app's data folder: WAL, foreign keys on, schema versions by
 * `PRAGMA user_version`. Migrations are additive: a new version appends to `MIGRATIONS`, never
 * edits an old one. A connection is opened per operation and closed after (`withDb`), so nothing
 * is held between calls and every load of the backend shares the one file.
 */

export type Db = Database

const MIGRATIONS: readonly string[] = [
  // 1: decks, notes, cards, reviews, settings.
  `
  CREATE TABLE decks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    description TEXT NOT NULL DEFAULT '',
    color INTEGER NOT NULL DEFAULT 1 CHECK (color BETWEEN 1 AND 6),
    created_at TEXT NOT NULL
  );
  CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    deck_id TEXT REFERENCES decks(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('basic', 'reversed', 'cloze', 'typed')),
    front TEXT NOT NULL,
    back TEXT NOT NULL DEFAULT '',
    extra TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('draft', 'active')),
    source TEXT NOT NULL,
    dup_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX notes_deck ON notes(deck_id, status);
  CREATE INDEX notes_status_created ON notes(status, created_at);
  CREATE INDEX notes_created ON notes(created_at);
  CREATE INDEX notes_updated ON notes(updated_at);
  CREATE INDEX notes_dup ON notes(dup_key);
  -- Covers the card → note join of the queue and the counts (status and deck without the row).
  CREATE INDEX notes_join ON notes(id, status, deck_id);
  CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    variant TEXT NOT NULL,
    due TEXT NOT NULL,
    stability REAL NOT NULL DEFAULT 0,
    difficulty REAL NOT NULL DEFAULT 0,
    scheduled_days INTEGER NOT NULL DEFAULT 0,
    learning_steps INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    state INTEGER NOT NULL DEFAULT 0,
    last_review TEXT,
    paused INTEGER NOT NULL DEFAULT 0,
    skip_until TEXT,
    leech INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE (note_id, variant)
  );
  CREATE INDEX cards_queue ON cards(paused, state, due);
  CREATE INDEX cards_lapses ON cards(lapses);
  CREATE TABLE reviews (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
    state INTEGER NOT NULL,
    due TEXT NOT NULL,
    stability REAL NOT NULL,
    difficulty REAL NOT NULL,
    scheduled_days INTEGER NOT NULL,
    elapsed_days INTEGER NOT NULL,
    reviewed_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL,
    prev TEXT
  );
  CREATE INDEX reviews_card ON reviews(card_id, reviewed_at);
  CREATE INDEX reviews_note ON reviews(note_id, reviewed_at);
  CREATE INDEX reviews_at ON reviews(reviewed_at);
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // 2: a note's own cards by pause, state and due. Without it the planner prefers cards_queue
  // (paused=?) for the library's per-note subqueries and walks every paused card for every note.
  `
  CREATE INDEX cards_note_state ON cards(note_id, paused, state, due);
  `,
]

export const SCHEMA_VERSION = MIGRATIONS.length

export function dbPath(dataDir: string): string {
  return join(dataDir, 'recall.db')
}

/** Open the file, set it up and bring its schema to the current version. */
export function openDb(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true })
  const db = new Database(dbPath(dataDir), { create: true, strict: true })
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA synchronous = NORMAL')
  migrate(db)
  return db
}

function migrate(db: Db): void {
  const { user_version: version } = db.query('PRAGMA user_version').get() as { user_version: number }
  if (version > SCHEMA_VERSION) {
    throw new Error(`recall.db is from a newer Recall (schema ${version}); update the app.`)
  }
  if (version === SCHEMA_VERSION) return
  db.transaction(() => {
    for (let next = version; next < SCHEMA_VERSION; next += 1) db.exec(MIGRATIONS[next]!)
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  }).immediate()
}

/** Run `use` on an open connection and close it after, also when it throws. */
export function withDb<T>(dataDir: string, use: (db: Db) => T): T {
  const db = openDb(dataDir)
  try {
    return use(db)
  } finally {
    db.close()
  }
}

/** Run `write` in one IMMEDIATE transaction: all of it or nothing. */
export function inTransaction<T>(db: Db, write: () => T): T {
  return db.transaction(write).immediate()
}
