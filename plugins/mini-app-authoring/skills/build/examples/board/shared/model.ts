import { z } from 'zod'

/**
 * THE MODEL — what the board keeps, shared by the backend, the agent's tools and the screen. The
 * collection stores what these schemas allow, the screen reads the same shapes, and what the agent
 * is told comes from `describeForAgent`, so the person and the agent always see the same board.
 * Pure functions only: no storage, network or React, so they are tested in milliseconds.
 */

/** The mini app's name: its routes are `/rpc/<APP>/…`. */
export const APP = 'example-board'
/** The collection: its routes are `/rpc/<APP>/<CARDS>`. It is a chat collection (see cards.ts). */
export const CARDS = 'cards'

/** The columns, left to right. The order is the flow a card follows. */
export const STAGES = ['backlog', 'doing', 'review', 'done'] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_LABEL: Record<Stage, string> = {
  backlog: 'Backlog',
  doing: 'In progress',
  review: 'Review',
  done: 'Done',
}

/**
 * What a person or the agent sends to add or change a card.
 *
 * No field has `.default()`: a change sends only the fields it names, and on the current Localix
 * release a default would be applied again and put the field back. Defaults are filled where a card
 * is made (`create` in backend/cards.ts). `null` clears `points` and `due` on a change.
 */
export const cardInputSchema = z.object({
  title: z.string().trim().min(1, 'Name the card.').max(120, 'Keep the name under 120 characters.'),
  note: z.string().trim().max(500, 'Keep the note under 500 characters.').optional(),
  assignee: z.string().trim().max(60).optional(),
  /** The effort estimate; the column totals add it up. */
  points: z.number().int().min(1).max(100).nullish(),
  /** `YYYY-MM-DD`. */
  due: z.iso.date('Use a valid date.').nullish(),
  /** `backlog` when omitted on create. */
  stage: z.enum(STAGES).optional(),
})

/** One stored card: the input with the fields the server always fills. */
export const cardSchema = z.object({
  id: z.string(),
  title: z.string(),
  note: z.string(),
  assignee: z.string(),
  points: z.number().nullable(),
  due: z.string().nullable(),
  stage: z.enum(STAGES),
  /** ISO 8601; the order of cards inside a column. */
  createdAt: z.string(),
})

export type Card = z.infer<typeof cardSchema>
export type CardInput = z.input<typeof cardInputSchema>

/** The cards of one column, oldest first: a card keeps its place when its neighbours move. */
export function cardsIn(cards: readonly Card[], stage: Stage): Card[] {
  return cards
    .filter((card) => card.stage === stage)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

/** What a column header shows: how many cards, and the points they add up to. */
export function columnTotals(cards: readonly Card[]): { count: number; points: number } {
  return { count: cards.length, points: cards.reduce((sum, card) => sum + (card.points ?? 0), 0) }
}

/** The stage next to this one, for the keyboard; `null` at either end. */
export function neighbour(stage: Stage, step: -1 | 1): Stage | null {
  return STAGES[STAGES.indexOf(stage) + step] ?? null
}

/** Late means past its day and not finished. `today` is `YYYY-MM-DD`, so the compare is a string's. */
export function isOverdue(card: Card, today: string): boolean {
  return card.stage !== 'done' && card.due !== null && card.due < today
}

/** "1 card", "3 cards": counts read as words, never "1 cards". */
export function countOf(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`
}

/** What the agent is told: every column with its cards and their ids, so it can move one. */
export function describeForAgent(cards: readonly Card[]): string {
  if (!cards.length) return 'The board is empty.'
  const columns = STAGES.map((stage) => {
    const here = cardsIn(cards, stage)
    const { count, points } = columnTotals(here)
    const lines = here.map((card) => {
      const facts = [
        card.assignee,
        card.points ? `${card.points} pts` : '',
        card.due ? `due ${card.due}` : '',
      ].filter(Boolean)
      return `- ${card.title}${facts.length ? ` (${facts.join(', ')})` : ''} [id ${card.id}]`
    })
    return [`${STAGE_LABEL[stage]} — ${countOf(count, 'card')}, ${points} pts`, ...lines].join('\n')
  })
  return columns.join('\n\n')
}
