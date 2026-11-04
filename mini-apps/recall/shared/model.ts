import { z } from 'zod'

/**
 * THE MODEL — what Recall keeps, shared by the backend, the agent's tools and the screen. Rows are
 * camelCase here and snake_case in SQLite (`backend/repo/*` maps them). Pure: no storage, no React.
 *
 * Words: a **note** is what the person writes (front, back, extra); it makes one or more **cards**
 * (a variant each: forward, reverse, c1…). The screen calls both "cards".
 */

export const APP = 'recall'

/** The deck filter value for notes without a deck. */
export const INBOX = 'inbox'

export const LIMITS = {
  deckName: 100,
  deckDescription: 500,
  text: 20_000,
  tag: 50,
  tags: 30,
  addBatch: 200,
  page: 200,
} as const

export const NOTE_KINDS = ['basic', 'reversed', 'cloze', 'typed'] as const
export const noteKindSchema = z.enum(NOTE_KINDS)
export type NoteKind = z.infer<typeof noteKindSchema>

export const noteStatusSchema = z.enum(['draft', 'active'])
export type NoteStatus = z.infer<typeof noteStatusSchema>

/** 1 Again · 2 Hard · 3 Good · 4 Easy. */
export const ratingSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
export type Rating = z.infer<typeof ratingSchema>
export const RATING_NAMES: Record<Rating, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }

/** FSRS card states. */
export const CardState = { New: 0, Learning: 1, Review: 2, Relearning: 3 } as const
export const cardStateSchema = z.number().int().min(0).max(3)

/** Where a review came from: the screen, a quiz in the chat, or replayed from an import. */
export const reviewSourceSchema = z.enum(['screen', 'chat', 'import'])
export type ReviewSource = z.infer<typeof reviewSourceSchema>

export const deckSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** 1..6, a host chart colour slot. */
  color: z.number().int().min(1).max(6),
  createdAt: z.string(),
})
export type Deck = z.infer<typeof deckSchema>

export const noteSchema = z.object({
  id: z.string(),
  /** `null` is the Inbox. */
  deckId: z.string().nullable(),
  kind: noteKindSchema,
  front: z.string(),
  back: z.string(),
  extra: z.string(),
  tags: z.array(z.string()),
  status: noteStatusSchema,
  /** 'agent' | 'manual' | 'import:<file>'. */
  source: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Note = z.infer<typeof noteSchema>

/** A card's memory state, as FSRS keeps it. Times are ISO 8601 UTC. */
export const memorySchema = z.object({
  due: z.string(),
  stability: z.number(),
  difficulty: z.number(),
  scheduledDays: z.number(),
  learningSteps: z.number(),
  reps: z.number(),
  lapses: z.number(),
  state: cardStateSchema,
  lastReview: z.string().nullable(),
})
export type Memory = z.infer<typeof memorySchema>

/** Everything a review can change on a card: what undo puts back. */
export const cardSnapshotSchema = memorySchema.extend({
  paused: z.boolean(),
  skipUntil: z.string().nullable(),
  leech: z.boolean(),
})
export type CardSnapshot = z.infer<typeof cardSnapshotSchema>

export const cardSchema = cardSnapshotSchema.extend({
  id: z.string(),
  noteId: z.string(),
  /** 'forward' | 'reverse' | 'c1'…'cN'. */
  variant: z.string(),
})
export type Card = z.infer<typeof cardSchema>

export const reviewSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  noteId: z.string(),
  rating: ratingSchema,
  /** The FSRS log: the state and figures the review produced. */
  state: cardStateSchema,
  due: z.string(),
  stability: z.number(),
  difficulty: z.number(),
  scheduledDays: z.number(),
  elapsedDays: z.number(),
  reviewedAt: z.string(),
  durationMs: z.number(),
  source: reviewSourceSchema,
  /** The card before this review, for undo. */
  prev: cardSnapshotSchema.nullable(),
})
export type Review = z.infer<typeof reviewSchema>

export const RETENTIONS = [0.8, 0.9, 0.95] as const

export const settingsSchema = z.object({
  retention: z.union([z.literal(0.8), z.literal(0.9), z.literal(0.95)]),
  newPerDay: z.number().int().min(0).max(1000),
  buttons: z.enum(['two', 'four']),
  dayStartsAt: z.number().int().min(0).max(23),
  dailyGoal: z.number().int().min(1).max(5000),
  typedAnswerCheck: z.boolean(),
  suggestPlacement: z.boolean(),
  /** Play a card's first sound when it appears and the answer's when it is turned over. */
  autoplaySounds: z.boolean(),
})
export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  retention: 0.9,
  newPerDay: 20,
  buttons: 'two',
  dayStartsAt: 4,
  dailyGoal: 20,
  typedAnswerCheck: false,
  suggestPlacement: true,
  autoplaySounds: true,
}

/** A change to the settings: only the fields it names. */
export const settingsPatchSchema = settingsSchema.partial()
export type SettingsPatch = z.infer<typeof settingsPatchSchema>

const tagSchema = z.string().trim().min(1).max(LIMITS.tag)

/** Tags as stored: lower-case, no '#', no spaces, unique, in the order given. */
export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of tags) {
    for (const part of raw.split(/[\s,]+/)) {
      const tag = part.replace(/^#+/, '').trim().toLowerCase()
      if (tag && !out.includes(tag)) out.push(tag.slice(0, LIMITS.tag))
    }
  }
  return out
}

export const deckInputSchema = z.object({
  name: z.string().trim().min(1, 'Name the deck.').max(LIMITS.deckName),
  description: z.string().trim().max(LIMITS.deckDescription).optional(),
  color: z.number().int().min(1).max(6).optional(),
})
export type DeckInput = z.infer<typeof deckInputSchema>

/**
 * What the person or the agent sends to make a note. No `.default()`: a change sends only the
 * fields it names. `deckId: null` is the Inbox.
 */
export const noteInputSchema = z.object({
  kind: noteKindSchema.optional(),
  front: z.string().trim().min(1, 'Write the front.').max(LIMITS.text),
  back: z.string().trim().max(LIMITS.text).optional(),
  extra: z.string().trim().max(LIMITS.text).optional(),
  deckId: z.string().nullable().optional(),
  tags: z.array(tagSchema).max(LIMITS.tags).optional(),
  status: noteStatusSchema.optional(),
})
export type NoteInput = z.infer<typeof noteInputSchema>
export const notePatchSchema = noteInputSchema.partial()
export type NotePatch = z.infer<typeof notePatchSchema>

/** The states a person filters the library by. */
export const LIBRARY_STATES = ['new', 'learning', 'review', 'paused', 'hard', 'draft'] as const
export const libraryStateSchema = z.enum(LIBRARY_STATES)
export type LibraryState = z.infer<typeof libraryStateSchema>

export const LIBRARY_SORTS = ['newest', 'oldest', 'updated', 'due', 'hardest', 'alpha'] as const
export const librarySortSchema = z.enum(LIBRARY_SORTS)
export type LibrarySort = z.infer<typeof librarySortSchema>

/** Which cards: decks (`'inbox'` for none) and tags. Empty means every one. */
export const cardFilterSchema = z.object({
  deckIds: z.array(z.string()).max(200).optional(),
  tags: z.array(tagSchema).max(50).optional(),
})
export type CardFilter = z.infer<typeof cardFilterSchema>

export const libraryQuerySchema = cardFilterSchema.extend({
  q: z.string().trim().max(500).optional(),
  /** 'text' matches words; 'meaning' ranks by the embedding model (text when it is not ready). */
  mode: z.enum(['text', 'meaning']).optional(),
  states: z.array(libraryStateSchema).optional(),
  kinds: z.array(noteKindSchema).optional(),
  status: noteStatusSchema.optional(),
  sort: librarySortSchema.optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(LIMITS.page).optional(),
})
export type LibraryQuery = z.infer<typeof libraryQuerySchema>

/** The full backup. The JSON export is this object; it imports back losslessly. */
export interface RecallExport {
  version: 1
  exportedAt: string
  decks: Deck[]
  notes: Note[]
  cards: Card[]
  reviews: Review[]
  settings: Settings
}

export const recallExportSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  decks: z.array(deckSchema),
  notes: z.array(noteSchema),
  cards: z.array(cardSchema),
  reviews: z.array(reviewSchema),
  // A backup made before a setting existed has no value for it: it reads as the default.
  settings: settingsSchema.extend({ autoplaySounds: z.boolean().default(DEFAULT_SETTINGS.autoplaySounds) }),
})
