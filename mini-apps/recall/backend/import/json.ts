import { recallExportSchema, type RecallExport } from '../../shared/model'
import { ImportError, decodeText, plural } from './common'
import type { ImportBatch, ImportedNote, ImportedReview } from './types'

/**
 * Recall's own JSON backup (`RecallExport`). The notes come back with their decks, tags, kinds, the
 * answers given to each card and which notes were paused; card scheduling is rebuilt from the
 * answers when they are replayed, so nothing else is needed.
 */

/** Notes of a backup in the shape the store imports, with each card's answers in time order. */
export function notesOfExport(data: RecallExport): ImportedNote[] {
  const deckNames = new Map(data.decks.map((deck) => [deck.id, deck.name]))
  const cards = new Map<string, RecallExport['cards']>()
  const variantOf = new Map<string, string>()
  for (const card of data.cards) {
    variantOf.set(card.id, card.variant)
    const list = cards.get(card.noteId)
    if (list) list.push(card)
    else cards.set(card.noteId, [card])
  }
  const reviews = new Map<string, RecallExport['reviews']>()
  for (const review of data.reviews) {
    const list = reviews.get(review.noteId)
    if (list) list.push(review)
    else reviews.set(review.noteId, [review])
  }
  return data.notes.map((note) => {
    const deck = note.deckId ? deckNames.get(note.deckId) : undefined
    const progress: Record<string, ImportedReview[]> = {}
    for (const review of [...(reviews.get(note.id) ?? [])].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt))) {
      const variant = variantOf.get(review.cardId)
      if (!variant) continue
      const log: ImportedReview = { rating: review.rating, reviewedAt: review.reviewedAt }
      if (review.durationMs > 0) log.durationMs = review.durationMs
      ;(progress[variant] ??= []).push(log)
    }
    const own = cards.get(note.id) ?? []
    return {
      kind: note.kind,
      front: note.front,
      back: note.back,
      extra: note.extra,
      tags: note.tags,
      ...(deck ? { deck } : {}),
      ...(Object.keys(progress).length ? { progress } : {}),
      ...(own.length && own.every((card) => card.paused) ? { paused: true } : {}),
    }
  })
}

export function parseJsonBackup(name: string, bytes: Uint8Array): ImportBatch {
  const warnings: string[] = []
  let value: unknown
  try {
    value = JSON.parse(decodeText(bytes, warnings))
  } catch (error) {
    throw new ImportError('The file is not valid JSON.', { cause: error })
  }
  if (value && typeof value === 'object' && (value as { version?: unknown }).version !== 1 && 'version' in value) {
    throw new ImportError('This backup was made by a newer version of Recall and cannot be read.')
  }
  const parsed = recallExportSchema.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new ImportError(
      `The file is not a Recall backup${issue ? ` (${issue.path.join('.') || 'file'}: ${issue.message})` : ''}.`,
    )
  }
  const data = parsed.data as RecallExport
  const notes = notesOfExport(data)
  const used = new Set(notes.map((note) => note.deck))
  const withMedia = notes.filter((note) => /media\//.test(`${note.front}${note.back}${note.extra}`)).length
  if (withMedia) {
    warnings.push(`${plural(withMedia, 'note')} with pictures or sounds: a backup holds neither, so they show only if the files are already here`)
  }
  return {
    source: name,
    format: 'json',
    decks: data.decks
      .filter((deck) => used.has(deck.name))
      .map((deck) => ({ name: deck.name, description: deck.description })),
    notes,
    media: [],
    mediaCounts: { pictures: 0, sounds: 0 },
    notices: [],
    warnings,
  }
}
