import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  exactFields,
  hasTemplates,
  mapNote,
  planType,
  renderSides,
  soundNames,
  usable,
  type Plan,
  type Side,
} from './anki-notes'
import { readCollection, readReviews, type AnkiCard, type AnkiNote } from './apkg-schema'
import { ImportError, MAX_TOTAL_BYTES, normalizeDeckName, normalizeTags, plural } from './common'
import { htmlToMarkdown } from './html-to-md'
import {
  MediaStore,
  createImageResolver,
  createSoundResolver,
  imageExtension,
  imageWarnings,
  soundExtension,
  soundNotices,
  soundWarnings,
  type ImageCounts,
  type SoundCounts,
} from './media'
import { protoMessages, protoString, readProto } from './protobuf'
import type { ImportBatch, ImportedNote, ImportedReview } from './types'
import { ZipReader, isZstd, zstdDecompress } from './zip'

/**
 * Anki packages (`.apkg`, `.colpkg`): a zip holding the collection (`collection.anki21b` zstd,
 * `collection.anki21` or `collection.anki2` SQLite), a `media` map and the media files numbered.
 * The newest collection present wins: the old name in a modern export is only a stub.
 *
 * What a note becomes comes from its note type's templates (`anki-notes.ts`); pictures and sounds
 * the cards use are stored under their hash. A preview reads no media: it counts what it would store.
 */

const COLLECTIONS = ['collection.anki21b', 'collection.anki21', 'collection.anki2']
const SQLITE_HEADER = 'SQLite format 3\u0000'
/** A sound on at least this share of 10 or more notes is decoration (a silent clip), not content. */
const DECORATION_SHARE = 0.9
const DECORATION_MIN_NOTES = 10

/** Anki's media map: file number → original name (old: JSON; new: zstd protobuf of entries). */
function readMediaMap(zip: ZipReader): Map<string, string> {
  const names = new Map<string, string>()
  const raw = zip.read('media')
  if (!raw?.length) return names
  try {
    const bytes = isZstd(raw) ? zstdDecompress(raw, 'media') : raw
    if (bytes[0] === 0x7b) {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
      for (const [number, name] of Object.entries(parsed))
        if (typeof name === 'string') names.set(name, number)
    } else {
      protoMessages(readProto(bytes), 1).forEach((entry, index) => {
        const name = protoString(entry, 1)
        if (name) names.set(name, String(index))
      })
    }
  } catch (error) {
    if (error instanceof ImportError && /expands/.test(error.message)) throw error
    // An unreadable media map only costs the media, which is reported as missing.
  }
  return names
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

export async function parseApkg(
  name: string,
  bytes: Uint8Array,
  mediaDir: string,
  preview = false,
): Promise<ImportBatch> {
  const zip = new ZipReader(bytes)
  const temp = mkdtempSync(join(tmpdir(), 'recall-anki-'))
  try {
    const db = openCollection(zip, temp)
    try {
      return build(name, zip, db, mediaDir, preview)
    } finally {
      db.close()
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

/** The names that at least 90% of 10 or more notes play: a silent clip, not something to hear. */
function decorativeSounds(perNote: Set<string>[]): Set<string> {
  const decorative = new Set<string>()
  if (perNote.length < DECORATION_MIN_NOTES) return decorative
  const notes = new Map<string, number>()
  for (const names of perNote) for (const name of names) notes.set(name, (notes.get(name) ?? 0) + 1)
  for (const [name, count] of notes)
    if (count >= perNote.length * DECORATION_SHARE) decorative.add(name)
  return decorative
}

function build(
  source: string,
  zip: ZipReader,
  db: Database,
  mediaDir: string,
  preview: boolean,
): ImportBatch {
  const collection = readCollection(db)
  const store = new MediaStore(mediaDir, { dryRun: preview })
  const numbers = readMediaMap(zip)
  const found = new Map<string, string | null | undefined>()
  const lookup = (original: string, extensionOf: (name: string) => string | null) => {
    const key = `${extensionOf === imageExtension ? 'i' : 's'}\u0000${original}`
    if (found.has(key)) return found.get(key)
    const number = numbers.get(original)
    const entry = number === undefined ? undefined : zip.entries.get(number)
    const extension = extensionOf(original)
    let file: string | null | undefined
    if (!entry) file = undefined
    else if (!extension) file = null
    else if (preview) file = store.plan(original, extension, entry.size)
    else {
      let bytes = zip.read(number!)
      if (bytes && isZstd(bytes)) bytes = zstdDecompress(bytes, original)
      file = bytes ? store.write(original, bytes, extension) : undefined
    }
    found.set(key, file)
    return file
  }
  const imageCounts: ImageCounts = { missing: 0, unsupported: 0, embedded: 0 }
  const image = createImageResolver(
    store,
    (original) => lookup(original, imageExtension),
    imageCounts,
  )

  const cardsByNote = new Map<number, AnkiCard[]>()
  for (const card of collection.cards) {
    const list = cardsByNote.get(card.nid)
    if (list) list.push(card)
    else cardsByNote.set(card.nid, [card])
  }
  const deckOf = (card: AnkiCard | undefined) =>
    card && card.did !== 1 ? collection.decks.get(card.did) : undefined

  // Every note's cards are rendered first, so the sounds on nearly every note can be told apart.
  const notes = collection.notes as AnkiNote[]
  const sidesOf = new Map<number, Side[]>()
  const sidesByType = new Map<number, Side[][]>()
  const namesPerNote: Set<string>[] = []
  for (const note of notes) {
    const type = collection.noteTypes.get(note.mid)
    let text = note.fields.join('\n')
    if (hasTemplates(type)) {
      const sides = renderSides(type, note, {
        Deck: deckOf(cardsByNote.get(note.id)?.[0])?.name ?? '',
        Tags: note.tags.trim(),
      })
      sidesOf.set(note.id, sides)
      sidesByType.set(note.mid, [...(sidesByType.get(note.mid) ?? []), sides])
      text = sides.map((side) => `${side.question}\n${side.answer}`).join('\n')
    }
    namesPerNote.push(new Set(soundNames(text)))
  }
  const soundCounts: SoundCounts = {
    missing: 0,
    unsupported: 0,
    decorative: decorativeSounds(namesPerNote),
  }
  const sound = createSoundResolver(
    (original) => lookup(original, soundExtension),
    soundCounts,
    soundCounts.decorative,
  )

  // Notes keep the order Anki would show their new cards in; the rest follow, in note-id order.
  const dropped = { videos: 0, empty: 0 }
  const otherTypes = new Map<string, number>()
  const cardsAsNotes = new Map<string, number>()
  const plans = new Map<number, Plan>()
  const decks = new Map<string, string>()
  const imported: { note: ImportedNote; position: number }[] = []
  const owners = new Map<number, { note: ImportedNote; variant: string }>()
  const convert = (html: string) => {
    const result = htmlToMarkdown(html, { image, sound })
    dropped.videos += result.videos
    return result.markdown
  }

  for (const note of notes) {
    const type = collection.noteTypes.get(note.mid)
    if (!plans.has(note.mid)) plans.set(note.mid, planType(type, sidesByType.get(note.mid) ?? []))
    const plan = plans.get(note.mid)!
    const cards = cardsByNote.get(note.id) ?? []
    const ords = cards.map((card) => card.ord)
    if (plan.shape === 'fields' && !exactFields(type)) {
      otherTypes.set(type?.name ?? 'unknown', (otherTypes.get(type?.name ?? 'unknown') ?? 0) + 1)
    }
    const mapped = mapNote(plan, type, note, sidesOf.get(note.id) ?? [], ords, convert).filter(
      usable,
    )
    dropped.empty += Math.max(1, plan.shape === 'cards' ? ords.length : 1) - mapped.length
    if (plan.shape === 'cards' && type)
      cardsAsNotes.set(type.name, (cardsAsNotes.get(type.name) ?? 0) + mapped.length)
    for (const one of mapped) {
      const mine = one.ord === undefined ? cards : cards.filter((card) => card.ord === one.ord)
      const home = deckOf(mine[0])
      const deck = home ? normalizeDeckName(home.name) : ''
      if (deck && !decks.has(deck)) decks.set(deck, home!.description.trim())
      const result: ImportedNote = {
        ...one.note,
        tags: normalizeTags(note.tags.split(' ')),
        ...(deck ? { deck } : {}),
        ...(mine.length && mine.every((card) => card.queue === -1) ? { paused: true } : {}),
      }
      imported.push({ note: result, position: Math.min(Infinity, ...mine.map((card) => card.newPosition ?? Infinity)) })
      for (const card of mine) {
        const variant = one.variant(card.ord)
        if (variant) owners.set(card.id, { note: result, variant })
      }
    }
  }

  let kept = 0
  for (const review of readReviews(db)) {
    const owner = owners.get(review.cid)
    if (!owner) continue
    const log: ImportedReview = {
      rating: review.ease as 1 | 2 | 3 | 4,
      reviewedAt: new Date(review.at).toISOString(),
      durationMs: Math.min(Math.max(review.time, 0), 600_000),
    }
    const progress = (owner.note.progress ??= {})
    ;(progress[owner.variant] ??= []).push(log)
    kept++
  }

  const warnings: string[] = []
  if (dropped.videos) warnings.push(`${plural(dropped.videos, 'video')} dropped`)
  if (dropped.empty)
    warnings.push(`${plural(dropped.empty, 'note')} without a front or back skipped`)
  for (const [type, count] of otherTypes) {
    warnings.push(
      `${plural(count, 'note')} of the note type "${type}" imported as basic cards from their first two fields`,
    )
  }
  for (const [type, count] of cardsAsNotes) {
    warnings.push(
      count === 1
        ? `1 card of the note type "${type}" was imported as a separate basic note; it keeps its own progress`
        : `${count} cards of the note type "${type}" were imported as separate basic notes; each keeps its own progress`,
    )
  }
  warnings.push(...imageWarnings(imageCounts), ...soundWarnings(soundCounts))
  const notices = soundNotices(soundCounts)
  if (!kept && collection.notes.length) {
    notices.push('No study history in the file, so every card starts as new.')
  }
  return {
    source,
    format: 'apkg',
    decks: [...decks].map(([deckName, description]) => ({ name: deckName, description })),
    notes: imported.sort((a, b) => (a.position === b.position ? 0 : a.position < b.position ? -1 : 1)).map((entry) => entry.note),
    media: store.media,
    mediaCounts: store.counts(),
    ...(preview ? { preview: true as const } : {}),
    warnings,
    notices,
  }
}
