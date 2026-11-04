import { Database } from 'bun:sqlite'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync } from 'fflate'

/** Builds small real Anki packages for the tests, in the old schema and the modern one. */

export function tempDir(): { path: string; remove: () => void } {
  const path = mkdtempSync(join(tmpdir(), 'recall-import-test-'))
  return { path, remove: () => rmSync(path, { recursive: true, force: true }) }
}

const varint = (value: number): number[] => {
  const out: number[] = []
  let rest = value
  while (rest >= 0x80) {
    out.push((rest % 128) | 0x80)
    rest = Math.floor(rest / 128)
  }
  out.push(rest)
  return out
}

/** A protobuf message from (field, number | string | bytes) pairs. */
export function proto(fields: [number, number | string | Uint8Array][]): Uint8Array {
  const out: number[] = []
  for (const [field, value] of fields) {
    if (typeof value === 'number') out.push(...varint(field * 8), ...varint(value))
    else {
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
      out.push(...varint(field * 8 + 2), ...varint(bytes.length), ...bytes)
    }
  }
  return new Uint8Array(out)
}

export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])
export const AT = 1_700_000_000_000

const US = '\u001f'

interface Type {
  id: number
  name: string
  cloze?: boolean
  fields: string[]
  templates: string[]
}

export const TYPES: Type[] = [
  { id: 1, name: 'Basic', fields: ['Front', 'Back'], templates: ['Card 1'] },
  { id: 2, name: 'Basic (and reversed card)', fields: ['Front', 'Back'], templates: ['Card 1', 'Card 2'] },
  { id: 3, name: 'Cloze', cloze: true, fields: ['Text', 'Back Extra'], templates: ['Cloze'] },
  { id: 4, name: 'Vocabulary', fields: ['Word', 'Meaning', 'Example'], templates: ['Card 1'] },
]

/** [id, type, fields, tags, deck id] */
export const NOTES: [number, number, string[], string, number][] = [
  [101, 1, ['hola<br>[sound:a.mp3]', '<b>hello</b><img src="cat.png">'], ' Greek  Foo ', 2],
  [102, 2, ['uno', 'one'], '', 2],
  [103, 3, ['{{c1::Paris}} and {{c2::Rome}}', 'capitals'], '', 1],
  [104, 4, ['casa', 'house', 'mi casa'], '', 2],
  [105, 1, ['lonely front', ''], '', 2],
]

/** [card id, note id, ord, queue] */
export const CARDS: [number, number, number, number][] = [
  [1001, 101, 0, 0],
  [1002, 102, 0, 0],
  [1003, 102, 1, 0],
  [1004, 103, 0, 0],
  [1005, 103, 1, 0],
  [1006, 104, 0, -1],
  [1007, 105, 0, 0],
]

/** [card id, at, ease, type] */
export const REVLOG: [number, number, number, number][] = [
  [1001, AT + 2000, 1, 1],
  [1001, AT, 3, 0],
  [1001, AT + 1000, 2, 4],
  [1001, AT + 1500, 0, 1],
  [1003, AT + 7, 4, 1],
  [1005, AT + 5, 3, 0],
]

export const SCHEMA = {
  notes: 'CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text)',
  cards: 'CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text)',
  revlog: 'CREATE TABLE revlog (id integer primary key, cid integer, usn integer, ease integer, ivl integer, lastIvl integer, factor integer, time integer, type integer)',
}

function fill(db: Database): void {
  db.run(SCHEMA.notes)
  db.run(SCHEMA.cards)
  db.run(SCHEMA.revlog)
  for (const [id, mid, fields, tags] of NOTES) {
    db.run("INSERT INTO notes VALUES (?, ?, ?, 0, 0, ?, ?, ?, 0, 0, '')", [id, `g${id}`, mid, tags, fields.join(US), fields[0]!])
  }
  for (const [id, nid, ord, queue] of CARDS) {
    const did = NOTES.find((note) => note[0] === nid)![4]
    db.run("INSERT INTO cards VALUES (?, ?, ?, ?, 0, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, '')", [id, nid, did, ord, queue])
  }
  REVLOG.forEach(([cid, at, ease, type]) => {
    db.run('INSERT INTO revlog VALUES (?, ?, 0, ?, 0, 0, 0, 5000, ?)', [at, cid, ease, type])
  })
}

function oldCollection(path: string): void {
  const db = new Database(path)
  db.run('CREATE TABLE col (id integer primary key, models text, decks text)')
  const models = Object.fromEntries(
    TYPES.map((type) => [type.id, { name: type.name, type: type.cloze ? 1 : 0, flds: type.fields.map((name) => ({ name })), tmpls: type.templates.map((name) => ({ name })) }]),
  )
  const decks = { 1: { name: 'Default', desc: '' }, 2: { name: 'Spanish::Verbs', desc: 'Verbs to know' } }
  db.run('INSERT INTO col VALUES (1, ?, ?)', [JSON.stringify(models), JSON.stringify(decks)])
  fill(db)
  db.close()
}

function newCollection(path: string): void {
  const db = new Database(path)
  db.run('CREATE TABLE col (id integer primary key, models text, decks text)')
  db.run("INSERT INTO col VALUES (1, '{}', '{}')")
  db.run('CREATE TABLE notetypes (id integer primary key, name text not null collate nocase, mtime_secs integer, usn integer, config blob)')
  db.run('CREATE TABLE fields (ntid integer, ord integer, name text, config blob, primary key (ntid, ord))')
  db.run('CREATE TABLE templates (ntid integer, ord integer, name text, mtime_secs integer, usn integer, config blob, primary key (ntid, ord))')
  db.run('CREATE TABLE decks (id integer primary key, name text not null collate nocase, mtime_secs integer, usn integer, common blob, kind blob)')
  for (const type of TYPES) {
    db.run('INSERT INTO notetypes VALUES (?, ?, 0, 0, ?)', [type.id, type.name, proto([[1, type.cloze ? 1 : 0]])])
    type.fields.forEach((name, ord) => db.run("INSERT INTO fields VALUES (?, ?, ?, x'')", [type.id, ord, name]))
    type.templates.forEach((name, ord) => db.run("INSERT INTO templates VALUES (?, ?, ?, 0, 0, x'')", [type.id, ord, name]))
  }
  db.run("INSERT INTO decks VALUES (1, 'Default', 0, 0, x'', x'')")
  db.run("INSERT INTO decks VALUES (2, ?, 0, 0, x'', x'')", [`Spanish${US}Verbs`])
  fill(db)
  db.close()
}

/** An `.apkg` (old schema, `collection.anki2`) or `.colpkg` (modern: zstd `collection.anki21b`). */
export function buildApkg(
  schema: 'old' | 'new',
  options: { media?: Record<string, Uint8Array>; mediaNames?: string[] } = {},
): Uint8Array {
  const dir = tempDir()
  try {
    const path = join(dir.path, 'c.db')
    ;(schema === 'old' ? oldCollection : newCollection)(path)
    let collection = new Uint8Array(readFileSync(path))
    // Anki's tables use a collation no other SQLite knows; rename ours (same length) so the reader
    // is proven to cope with one. bun:sqlite cannot register a collation, so the bytes are patched.
    if (schema === 'new') {
      collection = new Uint8Array(Buffer.from(Buffer.from(collection).toString('latin1').replaceAll('collate nocase', 'collate unicas'), 'latin1'))
    }
    const names = options.mediaNames ?? ['cat.png', 'a.mp3']
    const media = { ...(options.media ?? { 'cat.png': PNG, 'a.mp3': new Uint8Array([9, 9]) }) }
    const files: Record<string, Uint8Array> = {}
    if (schema === 'old') {
      files['collection.anki2'] = collection
      files.media = new TextEncoder().encode(JSON.stringify(Object.fromEntries(names.map((name, index) => [String(index), name]))))
      names.forEach((name, index) => (files[String(index)] = media[name] ?? new Uint8Array(1)))
    } else {
      files['collection.anki2'] = new TextEncoder().encode('stub')
      files['collection.anki21b'] = Bun.zstdCompressSync(collection)
      files.media = Bun.zstdCompressSync(proto(names.map((name) => [1, proto([[1, name], [2, (media[name] ?? new Uint8Array(1)).length]])])))
      names.forEach((name, index) => (files[String(index)] = Bun.zstdCompressSync(media[name] ?? new Uint8Array(1))))
    }
    return zipSync(files)
  } finally {
    dir.remove()
  }
}
