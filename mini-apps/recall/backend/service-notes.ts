import { duplicateKey } from '../shared/cloze'
import { countOf } from '../shared/format'
import {
  INBOX,
  normalizeTags,
  type Card,
  type Deck,
  type DeckInput,
  type Note,
  type NotePatch,
  type NoteStatus,
  type SettingsPatch,
} from '../shared/model'
import type { BulkRequest } from '../shared/payloads'
import { newCardState } from '../shared/scheduler'
import { invalid, notFound, RecallError } from './errors'
import { createNote, editNote, resolveDeck, type NewNote } from './note-cards'
import { cardsOfNotes, setOnNotes, writeSnapshot } from './repo/cards'
import { deckByName, deleteDeck, getDeck, insertDeck, nextDeckColor, updateDeck } from './repo/decks'
import { deleteNotes, getNote, notesByIds, notesWithKeys, updateNote } from './repo/notes'
import { deleteReviewsOfCards } from './repo/reviews'
import { readSettings, writeSettings } from './repo/settings'
import type { Core } from './service'
import { queueWindow } from './service-study'

/** Writes to notes, decks and settings: each one transaction, each answering what it did. */

const NOTE_IDS = 'Read recall_find_cards for the ids.'

export interface AddOptions {
  source: string
  status: NoteStatus
  /** Leave out notes whose front exactly matches one already kept (or earlier in the batch). */
  skipDuplicates: boolean
}

export interface AddResult {
  added: { note: Note; cards: Card[] }[]
  skipped: { index: number; front: string; existingId: string }[]
}

export function noteOps(core: Core) {
  return {
    async addNotes(notes: readonly NewNote[], options: AddOptions): Promise<AddResult> {
      return core.write((db, now, touched) => {
        const existing = options.skipDuplicates
          ? new Map(notesWithKeys(db, notes.map((n) => duplicateKey({ kind: n.kind ?? 'basic', front: n.front }))).map((hit) => [hit.key, hit.id]))
          : new Map<string, string>()
        const result: AddResult = { added: [], skipped: [] }
        notes.forEach((input, index) => {
          const key = duplicateKey({ kind: input.kind ?? 'basic', front: input.front })
          const same = options.skipDuplicates ? existing.get(key) : undefined
          if (same) {
            result.skipped.push({ index, front: input.front, existingId: same })
            return
          }
          const made = createNote(db, input, { source: options.source, now, status: options.status })
          existing.set(key, made.note.id)
          touched.add(made.note.id)
          result.added.push(made)
        })
        return result
      })
    },

    async updateNote(id: string, patch: NotePatch) {
      return core.write((db, now, touched) => {
        const note = getNote(db, id)
        if (!note) throw notFound('card', NOTE_IDS)
        touched.add(id)
        return editNote(db, note, patch, now)
      })
    },

    async removeNotes(ids: readonly string[]): Promise<number> {
      return core.write((db, _now, touched) => {
        const removed = deleteNotes(db, ids)
        for (const id of ids) touched.add(id)
        return removed
      })
    },

    /** One action over many notes, in one transaction. */
    async bulk(request: BulkRequest): Promise<{ affected: number; message: string }> {
      return core.write((db, now, touched) => {
        const notes = notesByIds(db, request.ids)
        if (!notes.length) throw notFound('card', NOTE_IDS)
        const ids = notes.map((note) => note.id)
        const n = countOf(notes.length, 'note')
        const rewrite = (change: (note: Note) => Note) => {
          for (const note of notes) updateNote(db, { ...change(note), updatedAt: now.toISOString() })
        }
        switch (request.action) {
          case 'move': {
            if (request.deckId === undefined) throw invalid('Say which deck to move them to.')
            const deckId = request.deckId === INBOX ? null : resolveDeck(db, { deckId: request.deckId }, now)
            rewrite((note) => ({ ...note, deckId }))
            const name = deckId ? getDeck(db, deckId)?.name : 'the Inbox'
            return { affected: notes.length, message: `Moved ${n} to ${name}.` }
          }
          case 'tag-add':
          case 'tag-remove': {
            const tags = normalizeTags(request.tags ?? [])
            if (!tags.length) throw invalid('Name the tags.')
            rewrite((note) => ({
              ...note,
              tags:
                request.action === 'tag-add'
                  ? normalizeTags([...note.tags, ...tags])
                  : note.tags.filter((tag) => !tags.includes(tag)),
            }))
            const verb = request.action === 'tag-add' ? 'Tagged' : 'Removed the tags from'
            return { affected: notes.length, message: `${verb} ${n}: ${tags.map((t) => `#${t}`).join(' ')}.` }
          }
          case 'pause':
          case 'resume': {
            const cards = setOnNotes(db, ids, request.action === 'pause' ? 'paused = 1' : 'paused = 0')
            const verb = request.action === 'pause' ? 'Paused' : 'Resumed'
            return { affected: notes.length, message: `${verb} ${countOf(cards, 'card')} of ${n}.` }
          }
          case 'skip': {
            const until = queueWindow(now, readSettings(db), core.clock).end
            const cards = setOnNotes(db, ids, 'skip_until = $until', until)
            return { affected: notes.length, message: `Skipped ${countOf(cards, 'card')} until tomorrow.` }
          }
          case 'reset': {
            const cards = [...cardsOfNotes(db, ids).values()].flat()
            deleteReviewsOfCards(db, cards.map((card) => card.id))
            for (const card of cards) {
              writeSnapshot(db, card.id, { ...newCardState(now), paused: card.paused, skipUntil: null, leech: false })
            }
            return { affected: notes.length, message: `Reset ${countOf(cards.length, 'card')} to new; their history is cleared.` }
          }
          case 'accept':
          case 'discard':
            return draftAction(db, notes, request.action, now, touched)
          case 'delete': {
            deleteNotes(db, ids)
            for (const id of ids) touched.add(id)
            return { affected: notes.length, message: `Deleted ${n} with their cards and history.` }
          }
        }
      })
    },

    /** Accept or discard drafts: by ids, or every draft of a deck (or of all). */
    async drafts(input: { action: 'accept' | 'discard'; ids?: readonly string[]; deckId?: string; moveTo?: string | null }) {
      return core.write((db, now, touched) => {
        let notes: Note[]
        if (input.ids?.length) notes = notesByIds(db, input.ids).filter((note) => note.status === 'draft')
        else {
          const where = input.deckId === undefined ? '1' : input.deckId === INBOX ? 'deck_id IS NULL' : 'deck_id = $deck'
          notes = notesByIds(
            db,
            (db.query(`SELECT id FROM notes WHERE status = 'draft' AND ${where}`).all(
              input.deckId && input.deckId !== INBOX ? { deck: input.deckId } : {},
            ) as { id: string }[]).map((row) => row.id),
          )
        }
        if (input.moveTo !== undefined && input.action === 'accept') {
          const deckId = input.moveTo === null || input.moveTo === INBOX ? null : resolveDeck(db, { deckId: input.moveTo }, now)
          notes = notes.map((note) => ({ ...note, deckId }))
        }
        return draftAction(db, notes, input.action, now, touched)
      })
    },

    /** Create a deck, or change one found by id (or by name when no id is given). */
    async saveDeck(input: DeckInput & { id?: string }, options: { onlyNew?: boolean } = {}): Promise<{ deck: Deck; created: boolean }> {
      return core.write((db, now) => {
        const current = input.id ? getDeck(db, input.id) : options.onlyNew ? null : deckByName(db, input.name)
        if (input.id && !current) throw notFound('deck', 'Read recall_list_decks for the ids.')
        const clash = deckByName(db, input.name)
        if (clash && clash.id !== current?.id) throw new RecallError('conflict', `A deck named "${clash.name}" exists already.`)
        if (current) {
          const deck = { ...current, name: input.name, description: input.description ?? current.description, color: input.color ?? current.color }
          updateDeck(db, deck)
          return { deck, created: false }
        }
        const deck: Deck = {
          id: crypto.randomUUID(),
          name: input.name,
          description: input.description ?? '',
          color: input.color ?? nextDeckColor(db),
          createdAt: now.toISOString(),
        }
        insertDeck(db, deck)
        return { deck, created: true }
      })
    },

    async patchDeck(id: string, patch: Partial<DeckInput>) {
      const current = core.read((db) => getDeck(db, id))
      if (!current) throw notFound('deck', 'Read recall_list_decks for the ids.')
      return this.saveDeck({ id, name: patch.name ?? current.name, description: patch.description, color: patch.color })
    },

    /** Remove a deck; its notes move to the Inbox or are deleted with their cards. */
    async removeDeck(id: string, cards: 'inbox' | 'delete') {
      return core.write((db, _now, touched) => {
        const deck = getDeck(db, id)
        if (!deck) throw notFound('deck', 'Read recall_list_decks for the ids.')
        const ids = (db.query('SELECT id FROM notes WHERE deck_id = $id').all({ id }) as { id: string }[]).map((r) => r.id)
        if (cards === 'delete') {
          deleteNotes(db, ids)
          for (const noteId of ids) touched.add(noteId)
        } else db.query('UPDATE notes SET deck_id = NULL WHERE deck_id = $id').run({ id })
        deleteDeck(db, id)
        return { removed: deck.name, moved: cards === 'inbox' ? ids.length : 0, deleted: cards === 'delete' ? ids.length : 0 }
      })
    },

    async updateSettings(patch: SettingsPatch) {
      await core.write((db) => writeSettings(db, patch))
    },
  }
}

function draftAction(
  db: Parameters<typeof updateNote>[0],
  notes: readonly Note[],
  action: 'accept' | 'discard',
  now: Date,
  touched: Set<string>,
) {
  const drafts = notes.filter((note) => note.status === 'draft')
  if (action === 'discard') {
    deleteNotes(db, drafts.map((note) => note.id))
    for (const note of drafts) touched.add(note.id)
    return { affected: drafts.length, message: `Discarded ${countOf(drafts.length, 'draft')}.` }
  }
  for (const note of drafts) {
    updateNote(db, { ...note, status: 'active', updatedAt: now.toISOString() })
    // Accepted cards start fresh from now, so they are not overdue from when they were drafted.
    for (const card of cardsOfNotes(db, [note.id]).get(note.id) ?? []) {
      if (card.state === 0) writeSnapshot(db, card.id, { ...card, due: now.toISOString() })
    }
  }
  return { affected: drafts.length, message: `Accepted ${countOf(drafts.length, 'draft')}: they are ready to study.` }
}

