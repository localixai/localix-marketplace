import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readCollection, readReviews, type AnkiCard, type AnkiNote, type NoteType } from './apkg-schema'
import {
  ImportError,
  MAX_TOTAL_BYTES,
  hasCloze,
  normalizeDeckName,
  normalizeTags,
  plural,
} from './common'
import { htmlToMarkdown } from './html-to-md'
import { MediaStore, createImageResolver, imageWarnings, type ImageCounts } from './media'
import { protoMessages, protoString, readProto } from './protobuf'
import type { ImportBatch, ImportedNote, ImportedReview } from './types'
import { ZipReader, isZstd, zstdDecompress } from './zip'

/**
 * Anki packages (`.apkg`, `.colpkg`): a zip holding the collection (`collection.anki21b` zstd,
 * `collection.anki21` or `collection.anki2` SQLite), a `media` map and the media files numbered.
 * The newest collection present wins: the old name in a modern export is only a stub.
 */

const COLLECTIONS = ['collection.anki21b', 'collection.anki21', 'collection.anki2']
const SQLITE_HEADER = 'SQLite format 3\u0000'

type Mapped = { kind: ImportedNote['kind']; front: number; back: number; extra: number | null; variants: (ord: number) => string | null }

/** Anki's media map: file number → original name (old: JSON; new: zstd protobuf of entries). */
function readMediaMap(zip: ZipReader): Map<string, string> {
  const names = new Map<string, string>()
  const raw = zip.read('media')
  if (!raw?.length) return names
  try {
    const bytes = isZstd(raw) ? zstdDecompress(raw, 'media') : raw
    if (bytes[0] === 0x7b) {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
      for (const [number, name] of Object.entries(parsed)) if (typeof name === 'string') names.set(name, number)
    } else {
      protoMessages(readProto(bytes), 1).forEach((entry, index) => {
        const name = protoString(entry, 1)
        if (name) names.set(name, String(index))
      })
    }
  } catch (error) {
    if (error instanceof ImportError && /expands/.test(error.message)) throw error
    // An unreadable media map only costs the images, which are reported as missing.
  }
  return names
}

function mapNoteType(type: NoteType | undefined): { map: Mapped; exact: boolean } {
  const forward = (ord: number) => (ord === 0 ? 'forward' : null)
  const basic: Mapped = { kind: 'basic', front: 0, back: 1, extra: null, variants: forward }
  if (!type) return { map: basic, exact: false }
  if (type.cloze) {
    return { map: { kind: 'cloze', front: 0, back: -1, extra: type.fields > 1 ? 1 : null, variants: (ord) => `c${ord + 1}` }, exact: true }
  }
  if (type.templates === 1 && type.fields === 2) {
    const typed = /type in the answer/i.test(type.name)
    return { map: { ...basic, kind: typed ? 'typed' : 'basic' }, exact: true }
  }
  if (type.templates === 2 && type.fields === 2) {
    return { map: { ...basic, kind: 'reversed', variants: (ord) => (ord === 0 ? 'forward' : ord === 1 ? 'reverse' : null) }, exact: true }
  }
  return { map: basic, exact: false }
}

function openCollection(zip: ZipReader, temp: string): Database {
  const name = COLLECTIONS.find((candidate) => zip.has(candidate))
  if (!name) throw new ImportError('This is not an Anki package: it holds no collection.')
  let bytes = zip.read(name, MAX_TOTAL_BYTES)!
  if (isZstd(bytes)) bytes = zstdDecompress(bytes, name, MAX_TOTAL_BYTES)
  if (new TextDecoder('latin1').decode(bytes.subarray(0, 16)) !== SQLITE_HEADER) {
    throw new ImportError('The Anki collection in this file is not readable.')
  }
  const path = join(temp, 'collection.db')
  writeFileSync(path, bytes)
  try {
    const db = new Database(path, { readonly: true })
    db.run('PRAGMA query_only = ON')
    return db
  } catch (error) {
    throw new ImportError('The Anki collection in this file is not readable.', { cause: error })
  }
}

export async function parseApkg(name: string, bytes: Uint8Array, mediaDir: string): Promise<ImportBatch> {
  const zip = new ZipReader(bytes)
  const temp = mkdtempSync(join(tmpdir(), 'recall-anki-'))
  try {
    const db = openCollection(zip, temp)
    try {
      return build(name, zip, db, mediaDir)
    } finally {
      db.close()
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

function build(source: string, zip: ZipReader, db: Database, mediaDir: string): ImportBatch {
  const collection = readCollection(db)
  const store = new MediaStore(mediaDir)
  const numbers = readMediaMap(zip)
  const stored = new Map<string, string | null>()
  const counts: ImageCounts = { missing: 0, unsupported: 0, embedded: 0 }
  const lookup = (original: string) => {
    if (stored.has(original)) return stored.get(original)
    const number = numbers.get(original)
    if (number === undefined) return undefined
    let bytes = zip.read(number)
    if (bytes && isZstd(bytes)) bytes = zstdDecompress(bytes, original)
    const file = bytes ? store.write(original, bytes) : null
    stored.set(original, file)
    return file
  }
  const image = createImageResolver(store, lookup, counts)

  const cardsByNote = new Map<number, AnkiCard[]>()
  for (const card of collection.cards) {
    const list = cardsByNote.get(card.nid)
    if (list) list.push(card)
    else cardsByNote.set(card.nid, [card])
  }
  const cardOwner = new Map<number, { note: number; ord: number }>()
  for (const card of collection.cards) cardOwner.set(card.id, { note: card.nid, ord: card.ord })

  const dropped = { sounds: 0, empty: 0 }
  const otherTypes = new Map<string, number>()
  const decks = new Map<string, string>()
  const imported = new Map<number, { note: ImportedNote; map: Mapped }>()
  const convert = (html: string) => {
    const result = htmlToMarkdown(html, { image })
    dropped.sounds += result.sounds + result.videos
    return result.markdown
  }

  for (const note of collection.notes as AnkiNote[]) {
    const type = collection.noteTypes.get(note.mid)
    const { map, exact } = mapNoteType(type)
    if (!exact) otherTypes.set(type?.name ?? 'unknown', (otherTypes.get(type?.name ?? 'unknown') ?? 0) + 1)
    const front = convert(note.fields[map.front] ?? '')
    const back = map.kind === 'cloze' ? '' : convert(note.fields[map.back] ?? '')
    const extra = map.extra === null ? '' : convert(note.fields[map.extra] ?? '')
    if (!front || (map.kind === 'cloze' ? !hasCloze(front) : !back)) {
      dropped.empty++
      continue
    }
    const cards = cardsByNote.get(note.id) ?? []
    const first = cards[0] ? collection.decks.get(cards[0].did) : undefined
    const deck = first && cards[0]!.did !== 1 ? normalizeDeckName(first.name) : ''
    if (deck && !decks.has(deck)) decks.set(deck, first!.description.trim())
    imported.set(note.id, {
      map,
      note: {
        kind: map.kind,
        front,
        back,
        extra,
        tags: normalizeTags(note.tags.split(' ')),
        ...(deck ? { deck } : {}),
        ...(cards.length && cards.every((card) => card.queue === -1) ? { paused: true } : {}),
      },
    })
  }

  let kept = 0
  for (const review of readReviews(db)) {
    const owner = cardOwner.get(review.cid)
    const entry = owner ? imported.get(owner.note) : undefined
    const variant = owner && entry?.map.variants(owner.ord)
    if (!entry || !variant) continue
    const log: ImportedReview = {
      rating: review.ease as 1 | 2 | 3 | 4,
      reviewedAt: new Date(review.at).toISOString(),
      durationMs: Math.min(Math.max(review.time, 0), 600_000),
    }
    const progress = (entry.note.progress ??= {})
    ;(progress[variant] ??= []).push(log)
    kept++
  }

  const warnings: string[] = []
  if (dropped.sounds) warnings.push(`${plural(dropped.sounds, 'sound')} dropped`)
  if (dropped.empty) warnings.push(`${plural(dropped.empty, 'note')} without a front or back skipped`)
  for (const [type, count] of otherTypes) {
    warnings.push(`${plural(count, 'note')} of the note type "${type}" imported as basic cards from their first two fields`)
  }
  warnings.push(...imageWarnings(counts))
  if (!kept && collection.notes.length) warnings.push('The file has no review history; every card starts new')
  return {
    source,
    format: 'apkg',
    decks: [...decks].map(([deckName, description]) => ({ name: deckName, description })),
    notes: [...imported.values()].map((entry) => entry.note),
    media: store.media,
    warnings,
  }
}
