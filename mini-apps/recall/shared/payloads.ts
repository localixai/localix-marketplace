import { z } from 'zod'
import {
  cardFilterSchema,
  cardSchema,
  deckInputSchema,
  deckSchema,
  libraryQuerySchema,
  noteSchema,
  ratingSchema,
  reviewSchema,
} from './model'

/**
 * Request and response shapes of the routes (the table is `shared/api.ts`): the backend answers
 * these, the screen parses them. Study, today, notes, library and the judgments live here; stats,
 * settings, decks and import in `payloads-more.ts`.
 */

export const queueCountsSchema = z.object({
  learning: z.number(),
  review: z.number(),
  new: z.number(),
  total: z.number(),
})

export const deckRefSchema = z.object({ id: z.string(), name: z.string(), color: z.number() })

export const deckSummarySchema = deckSchema.extend({
  notes: z.number(),
  cards: z.number(),
  /** Cards to study today in this deck (learning + review + new within the limit). */
  due: z.number(),
  new: z.number(),
  /** Notes in this deck waiting to be accepted. */
  drafts: z.number(),
  /** Paused cards of accepted notes. */
  paused: z.number(),
  /** When the soonest scheduled card is due; null when none is scheduled. */
  nextDueAt: z.string().nullable(),
})
export type DeckSummary = z.infer<typeof deckSummarySchema>

export const todaySchema = z.object({
  day: z.string(),
  due: queueCountsSchema,
  minutes: z.number(),
  /** When nothing is due: when the next card is. */
  nextDueAt: z.string().nullable(),
  drafts: z.number(),
  inbox: z.number(),
  goal: z.object({ target: z.number(), done: z.number() }),
  streak: z.number(),
  decks: z.array(deckSummarySchema),
  inboxDue: z.number(),
  totals: z.object({ notes: z.number(), cards: z.number() }),
})
export type TodaySummary = z.infer<typeof todaySchema>

const outcomeSchema = z.object({ due: z.string(), intervalMs: z.number(), label: z.string() })

export const studyCardSchema = z.object({
  kind: z.enum(['learning', 'review', 'new']),
  card: cardSchema,
  note: noteSchema,
  deck: deckRefSchema.nullable(),
  /** Markdown. A cloze's prompt has `[…]` blanks; `clozeParts(note.front, cloze, reveal)` too. */
  prompt: z.string(),
  answer: z.string(),
  expected: z.string(),
  extra: z.string(),
  cloze: z.number().nullable(),
  typed: z.boolean(),
  /** Keyed by rating '1'..'4': the next due and its label ("10 min", "3 d"). */
  outcomes: z.record(z.enum(['1', '2', '3', '4']), outcomeSchema),
})
export type StudyCard = z.infer<typeof studyCardSchema>

export const studyNextSchema = z.object({
  card: studyCardSchema.nullable(),
  /** What is left in this session, the shown card included. */
  counts: queueCountsSchema,
  /** When nothing is left now: the next card's due (a learning card later today, or tomorrow's). */
  nextDueAt: z.string().nullable(),
  reviewedToday: z.number(),
})
export type StudyNext = z.infer<typeof studyNextSchema>

/** The queue's ids, for "12 of 34" and for a screen that preloads. */
export const studyQueueSchema = z.object({
  entries: z.array(
    z.object({ cardId: z.string(), noteId: z.string(), kind: z.enum(['learning', 'review', 'new']) }),
  ),
  counts: queueCountsSchema,
})

export const studyFilterSchema = cardFilterSchema

export const gradeRequestSchema = z.object({
  cardId: z.string().min(1),
  rating: ratingSchema,
  /** Time on the card, capped at 60 s when stored. */
  durationMs: z.number().int().min(0).max(3_600_000).optional(),
  filter: cardFilterSchema.optional(),
})
export const gradeResultSchema = z.object({
  review: reviewSchema,
  label: z.string(),
  /** True when this answer made it a hard card (the 8th lapse). */
  becameHard: z.boolean(),
  next: studyNextSchema,
})
export type GradeResult = z.infer<typeof gradeResultSchema>

export const undoResultSchema = z.object({
  /** The card put back as it was, to show again; null when there was nothing to undo. */
  card: studyCardSchema.nullable(),
  undone: z.object({ cardId: z.string(), rating: ratingSchema }).nullable(),
})

export const cardActionSchema = z.object({ cardId: z.string().min(1), filter: cardFilterSchema.optional() })

export const checkAnswerRequestSchema = z.object({
  cardId: z.string().min(1),
  answer: z.string().max(5000),
})
export const checkAnswerResultSchema = z.object({
  verdict: z.enum(['correct', 'partly', 'wrong', 'unsure']),
  /** The suggested rating the person confirms; null when they grade themselves. */
  rating: ratingSchema.nullable(),
  by: z.enum(['exact', 'model', 'none']),
  expected: z.string(),
})
export type CheckAnswerResult = z.infer<typeof checkAnswerResultSchema>

export const libraryCardSchema = cardSchema.pick({
  id: true,
  variant: true,
  state: true,
  due: true,
  paused: true,
  leech: true,
  skipUntil: true,
  lapses: true,
  reps: true,
})

export const libraryRowSchema = z.object({
  note: noteSchema,
  deck: deckRefSchema.nullable(),
  cards: z.array(libraryCardSchema),
})
export type LibraryRow = z.infer<typeof libraryRowSchema>

export const libraryPageSchema = z.object({
  rows: z.array(libraryRowSchema),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  nextOffset: z.number().nullable(),
  /** How a query was matched: by words, or by meaning. */
  by: z.enum(['text', 'meaning']),
})
export type LibraryPage = z.infer<typeof libraryPageSchema>

export const similarHitSchema = z.object({
  noteId: z.string(),
  front: z.string(),
  deck: z.string().nullable(),
  /** 1 for an exact match, otherwise the meaning similarity. */
  score: z.number(),
  exact: z.boolean(),
})
export type SimilarHit = z.infer<typeof similarHitSchema>

export const similarRequestSchema = z.object({
  kind: z.enum(['basic', 'reversed', 'cloze', 'typed']).optional(),
  front: z.string().trim().min(1).max(20_000),
  back: z.string().max(20_000).optional(),
  excludeId: z.string().optional(),
})
export const similarResultSchema = z.object({
  similar: z.array(similarHitSchema),
  by: z.enum(['meaning', 'exact']),
})

export const cardHistorySchema = cardSchema.extend({ retrievability: z.number() })

export const noteDetailSchema = z.object({
  note: noteSchema,
  deck: deckRefSchema.nullable(),
  cards: z.array(cardHistorySchema),
  /** Newest first, at most 100. */
  history: z.array(reviewSchema),
})
export type NoteDetail = z.infer<typeof noteDetailSchema>

export const saveNoteResultSchema = z.object({
  note: noteSchema,
  cards: z.array(cardSchema),
  similar: z.array(similarHitSchema),
})
export type SaveNoteResult = z.infer<typeof saveNoteResultSchema>

export const BULK_ACTIONS = [
  'move',
  'tag-add',
  'tag-remove',
  'pause',
  'resume',
  'skip',
  'reset',
  'accept',
  'discard',
  'delete',
] as const
/**
 * One action over notes, named either by `ids` (at most 5,000) or by `match`: the library query the
 * list was showing, which the server resolves itself. `expect` is how many notes the person was
 * told that is; if the list has changed since, the server refuses instead of guessing.
 */
export const bulkRequestSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(5000).optional(),
    match: libraryQuerySchema.omit({ offset: true, limit: true }).optional(),
    expect: z.number().int().min(0).optional(),
    action: z.enum(BULK_ACTIONS),
    /** For 'move': the deck, `null` for the Inbox. */
    deckId: z.string().nullable().optional(),
    /** For 'tag-add' / 'tag-remove'. */
    tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  })
  .refine((request) => (request.ids === undefined) !== (request.match === undefined), {
    message: 'Send either ids or match, not both and not neither.',
    path: ['ids'],
  })
  .refine((request) => request.match === undefined || request.expect !== undefined, {
    message: 'Say how many cards the list matched (expect).',
    path: ['expect'],
  })
export type BulkRequest = z.infer<typeof bulkRequestSchema>
export const bulkResultSchema = z.object({ affected: z.number(), message: z.string() })

export const draftsRequestSchema = z.object({
  action: z.enum(['accept', 'discard']),
  ids: z.array(z.string().min(1)).max(5000).optional(),
  /** Every draft of this deck (`'inbox'` for none) when no ids are given. */
  deckId: z.string().optional(),
  /** Accept into this deck (null → Inbox) instead of where each draft is. */
  moveTo: z.string().nullable().optional(),
})

export const placementSchema = z.object({
  noteId: z.string(),
  /** The suggested deck, or null to leave it in the Inbox. */
  deck: deckRefSchema.nullable(),
  tags: z.array(z.string()),
  by: z.enum(['meaning', 'model', 'none']),
})
export type Placement = z.infer<typeof placementSchema>
export const placementRequestSchema = z.object({
  /** Inbox notes to place; default the oldest 20 in the Inbox. */
  ids: z.array(z.string().min(1)).max(50).optional(),
})
export const placementResultSchema = z.object({ suggestions: z.array(placementSchema) })

export const deckCreateSchema = deckInputSchema
export const deckPatchSchema = deckInputSchema.partial()
export const deckRemoveSchema = z.object({ cards: z.enum(['inbox', 'delete']) })

