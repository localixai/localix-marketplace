import { noteProblem, variantsFor } from '../shared/cloze'
import { normalizeTags, type Card, type Note, type NoteKind, type NotePatch, type NoteStatus } from '../shared/model'
import { newCardState } from '../shared/scheduler'
import type { Db } from './db'
import { invalid } from './errors'
import { deckByName, getDeck, insertDeck, nextDeckColor } from './repo/decks'
import { cardsOfNote, deleteCards, insertCard } from './repo/cards'
import { deleteReviewsOfCards } from './repo/reviews'
import { insertNote, updateNote } from './repo/notes'

/**
 * Making and editing a note together with its cards, inside the caller's transaction. A note
 * makes its cards by kind (basic/typed → forward, reversed → forward + reverse, cloze → one per
 * number); an edit keeps every card whose variant still exists and adds or removes the rest.
 */

export interface NewNote {
  kind?: NoteKind
  front: string
  back?: string
  extra?: string
  /** A deck by id; `null` is the Inbox. */
  deckId?: string | null
  /** A deck by name, created when new (the agent's tools). Ignored when `deckId` is given. */
  deckName?: string
  tags?: readonly string[]
  status?: NoteStatus
}

/** A fresh card of a note, new and due now. */
export function freshCard(noteId: string, variant: string, now: Date): Card {
  return {
    id: crypto.randomUUID(),
    noteId,
    variant,
    ...newCardState(now),
    paused: false,
    skipUntil: null,
    leech: false,
  }
}

/** The deck id a note goes to: an existing id, a name (made when new), or the Inbox. */
export function resolveDeck(db: Db, input: Pick<NewNote, 'deckId' | 'deckName'>, now: Date): string | null {
  if (input.deckId !== undefined && input.deckId !== null) {
    if (!getDeck(db, input.deckId)) throw invalid('No deck has that id. List the decks for their ids.')
    return input.deckId
  }
  if (input.deckId === null || !input.deckName?.trim()) return null
  const name = input.deckName.trim().slice(0, 100)
  const found = deckByName(db, name)
  if (found) return found.id
  const id = crypto.randomUUID()
  insertDeck(db, { id, name, description: '', color: nextDeckColor(db), createdAt: now.toISOString() })
  return id
}

/** Insert a note and its cards. Throws `invalid` when the note cannot make a card. */
export function createNote(
  db: Db,
  input: NewNote,
  context: { source: string; now: Date; status: NoteStatus },
): { note: Note; cards: Card[] } {
  const kind = input.kind ?? 'basic'
  const front = input.front.trim()
  const back = (input.back ?? '').trim()
  const problem = noteProblem(kind, front, back)
  if (problem) throw invalid(problem)
  const at = context.now.toISOString()
  const note: Note = {
    id: crypto.randomUUID(),
    deckId: resolveDeck(db, input, context.now),
    kind,
    front,
    back,
    extra: (input.extra ?? '').trim(),
    tags: normalizeTags(input.tags ?? []),
    status: input.status ?? context.status,
    source: context.source,
    createdAt: at,
    updatedAt: at,
  }
  insertNote(db, note)
  const cards = variantsFor(kind, front).map((variant) => freshCard(note.id, variant, context.now))
  for (const card of cards) insertCard(db, card, at)
  return { note, cards }
}

/** Apply a change to a note and bring its cards in line. Fields left out stay as they are. */
export function editNote(db: Db, note: Note, patch: NotePatch, now: Date): { note: Note; cards: Card[] } {
  const next: Note = {
    ...note,
    kind: patch.kind ?? note.kind,
    front: patch.front?.trim() ?? note.front,
    back: patch.back?.trim() ?? note.back,
    extra: patch.extra?.trim() ?? note.extra,
    deckId: patch.deckId === undefined ? note.deckId : resolveDeck(db, { deckId: patch.deckId }, now),
    tags: patch.tags ? normalizeTags(patch.tags) : note.tags,
    status: patch.status ?? note.status,
    updatedAt: now.toISOString(),
  }
  const problem = noteProblem(next.kind, next.front, next.back)
  if (problem) throw invalid(problem)
  updateNote(db, next)
  const wanted = variantsFor(next.kind, next.front)
  const existing = cardsOfNote(db, note.id)
  const gone = existing.filter((card) => !wanted.includes(card.variant)).map((card) => card.id)
  if (gone.length) {
    deleteReviewsOfCards(db, gone)
    deleteCards(db, gone)
  }
  const have = new Set(existing.map((card) => card.variant))
  for (const variant of wanted) {
    if (!have.has(variant)) insertCard(db, freshCard(note.id, variant, now), next.updatedAt)
  }
  return { note: next, cards: cardsOfNote(db, note.id) }
}
