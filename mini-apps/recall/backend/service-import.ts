import { duplicateKey, noteProblem, variantsFor } from '../shared/cloze'
import { countOf, snippet } from '../shared/format'
import { textOnly } from '../shared/sound'
import { normalizeTags, type Review } from '../shared/model'
import type { ImportOptions, ImportPreview, ImportResult } from '../shared/payloads-more'
import { createScheduler, LEECH_LAPSES } from '../shared/scheduler'
import { invalid } from './errors'
import type { ImportBatch, ImportedNote } from './import/types'
import { freshCard } from './note-cards'
import { insertCard } from './repo/cards'
import { deckByName, getDeck, insertDeck, nextDeckColor } from './repo/decks'
import { insertNote, notesWithKeys } from './repo/notes'
import { insertReview } from './repo/reviews'
import { readSettings } from './repo/settings'
import type { Core } from './service'

/**
 * Import over the parsers' `ImportBatch` (DESIGN.md's seam): a preview that changes nothing, and a
 * commit that writes every note, card and replayed review in one transaction. Imported progress is
 * replayed through the scheduler, so a card's memory comes from its review log like any other.
 */

const keyOf = (note: ImportedNote) => duplicateKey({ kind: note.kind, front: note.front })

export function importOps(core: Core) {
  return {
    previewImport: (batch: ImportBatch): ImportPreview =>
      core.read((db) => {
        const existing = new Set(notesWithKeys(db, batch.notes.map(keyOf)).map((hit) => hit.key))
        const perDeck = new Map<string, number>()
        for (const note of batch.notes) {
          if (note.deck) perDeck.set(note.deck, (perDeck.get(note.deck) ?? 0) + 1)
        }
        const names = [...new Set([...batch.decks.map((deck) => deck.name), ...perDeck.keys()])]
        return {
          source: batch.source,
          format: batch.format,
          notes: batch.notes.length,
          cards: batch.notes.reduce((sum, note) => sum + variantsFor(note.kind, note.front).length, 0),
          decks: names
            .map((name) => ({ name, notes: perDeck.get(name) ?? 0, exists: !!deckByName(db, name) }))
            .filter((deck) => deck.notes > 0),
          duplicates: batch.notes.filter((note) => existing.has(keyOf(note))).length,
          withProgress: batch.notes.filter((note) => Object.values(note.progress ?? {}).some((r) => r.length)).length,
          media: batch.mediaCounts.pictures + batch.mediaCounts.sounds,
          pictures: batch.mediaCounts.pictures,
          sounds: batch.mediaCounts.sounds,
          warnings: batch.warnings,
          notices: batch.notices,
          sample: batch.notes.slice(0, 5).map((note) => ({
            kind: note.kind,
            front: snippet(textOnly(note.front), 160),
            back: snippet(textOnly(note.back), 160),
          })),
        }
      }),

    async commitImport(batch: ImportBatch, options: ImportOptions = {}): Promise<ImportResult> {
      const status = options.status ?? 'draft'
      const keepProgress = options.keepProgress ?? true
      const skipDuplicates = options.skipDuplicates ?? true
      if (batch.preview) throw invalid('That was only a preview, so its sounds and pictures were not stored. Read the file again to import it.')
      return core.write((db, now, touched) => {
        if (options.deckId && !getDeck(db, options.deckId)) {
          throw invalid('No deck has that id. List the decks for their ids.')
        }
        const scheduler = createScheduler(readSettings(db))
        const at = now.toISOString()
        const descriptions = new Map(batch.decks.map((deck) => [deck.name.toLowerCase(), deck.description]))
        const decksCreated: string[] = []
        const deckIds = new Map<string, string>()
        const deckFor = (name: string | undefined): string | null => {
          if (options.deckId) return options.deckId
          const trimmed = name?.trim().slice(0, 100)
          if (!trimmed) return null
          const known = deckIds.get(trimmed.toLowerCase()) ?? deckByName(db, trimmed)?.id
          if (known) {
            deckIds.set(trimmed.toLowerCase(), known)
            return known
          }
          const id = crypto.randomUUID()
          const description = (descriptions.get(trimmed.toLowerCase()) ?? '').slice(0, 500)
          insertDeck(db, { id, name: trimmed, description, color: nextDeckColor(db), createdAt: at })
          deckIds.set(trimmed.toLowerCase(), id)
          decksCreated.push(trimmed)
          return id
        }
        const seen = skipDuplicates ? new Set(notesWithKeys(db, batch.notes.map(keyOf)).map((hit) => hit.key)) : new Set<string>()
        const placed = new Map<string | null, number>()
        let added = 0
        let cards = 0
        let skipped = 0
        let unreadable = 0
        let replayed = 0
        for (const [position, imported] of batch.notes.entries()) {
          const key = keyOf(imported)
          if (skipDuplicates && seen.has(key)) {
            skipped += 1
            continue
          }
          if (noteProblem(imported.kind, imported.front, imported.back)) {
            unreadable += 1
            continue
          }
          seen.add(key)
          const deckId = deckFor(imported.deck)
          const id = crypto.randomUUID()
          // A millisecond per note keeps the file's order in the library's oldest and newest lists.
          const stamp = new Date(now.getTime() + position).toISOString()
          insertNote(db, {
            id,
            deckId,
            kind: imported.kind,
            front: imported.front.trim(),
            back: imported.back.trim(),
            extra: imported.extra.trim(),
            tags: normalizeTags(imported.tags),
            status,
            source: `import:${batch.source}`.slice(0, 300),
            createdAt: stamp,
            updatedAt: stamp,
          })
          touched.add(id)
          added += 1
          placed.set(deckId, (placed.get(deckId) ?? 0) + 1)
          for (const variant of variantsFor(imported.kind, imported.front)) {
            // A millisecond per note keeps the file's order when the new cards are studied.
            const card = freshCard(id, variant, new Date(now.getTime() + position))
            const history = keepProgress ? (imported.progress?.[variant] ?? []) : []
            const steps = scheduler.replay(history, at)
            const last = steps.at(-1)?.after
            const memory = last ?? card
            insertCard(db, { ...card, ...memory, paused: !!imported.paused, leech: memory.lapses >= LEECH_LAPSES }, at)
            steps.forEach((step, index) => {
              const review: Review = {
                id: crypto.randomUUID(),
                cardId: card.id,
                noteId: id,
                ...step.log,
                durationMs: Math.min(60_000, Math.max(0, Math.round(history[index]?.durationMs ?? 0))),
                source: 'import',
                prev: { ...step.before, paused: false, skipUntil: null, leech: false },
              }
              insertReview(db, review)
            })
            replayed += steps.length
            cards += 1
          }
        }
        const warnings = [...batch.warnings]
        if (unreadable) warnings.push(`${countOf(unreadable, 'note')} without a front or back skipped`)
        return {
          source: batch.source,
          added,
          cards,
          skippedDuplicates: skipped,
          decksCreated,
          status,
          reviewsReplayed: replayed,
          warnings,
          notices: batch.notices,
          decks: [...placed.entries()].map(([deckId, notes]) => {
            const deck = deckId ? getDeck(db, deckId) : null
            return { id: deck?.id ?? 'inbox', name: deck?.name ?? 'Inbox', color: deck?.color ?? 0, notes }
          }),
        }
      })
    },
  }
}
