import { z } from 'zod'

/**
 * THE MODEL — what the app keeps, shared by the backend, the agent's tools and the screen. The
 * backend stores what these schemas allow, the screen reads the same shapes, and what the agent is
 * told comes from `describeForAgent`, so the person and the agent always see the same thing.
 *
 * Start your app here: rename `Item` after what it holds (a meal, a deal, a word to learn), give it
 * that thing's fields, and add the rules it computes. Pure functions only — no storage, network or
 * React — so they are tested in milliseconds.
 */

/** The mini app's name: its routes are `/rpc/<APP>/…`. */
export const APP = 'template'
/** The collection: its routes are `/rpc/<APP>/<ITEMS>`. */
export const ITEMS = 'items'

/**
 * What the person or the agent sends to add an item. No `.default()` here: a change sends only the
 * fields it names, and a default would put the field back to it. Fill defaults where an item is made
 * (`create` in backend/items.ts).
 */
export const itemInputSchema = z.object({
  title: z.string().trim().min(1, 'Name the item.').max(200),
  note: z.string().trim().max(2000).optional(),
  done: z.boolean().optional(),
})

/** One stored item. */
export const itemSchema = z.object({
  id: z.string(),
  title: z.string(),
  note: z.string(),
  done: z.boolean(),
  /** ISO 8601, set when the item is made. */
  createdAt: z.string(),
})

export type Item = z.infer<typeof itemSchema>
export type ItemInput = z.input<typeof itemInputSchema>

/** Open items first, newest first within each group. */
export function sortItems(items: readonly Item[]): Item[] {
  return [...items].sort(
    (a, b) => Number(a.done) - Number(b.done) || b.createdAt.localeCompare(a.createdAt),
  )
}

/** "1 item", "3 items": counts read as words, never "1 items". */
export function countOf(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`
}

/** What the agent is told: the counts and every item with its id, so it can act on one. */
export function describeForAgent(items: readonly Item[]): string {
  if (!items.length) return 'The list is empty.'
  const open = items.filter((item) => !item.done).length
  const lines = sortItems(items).map(
    (item) =>
      `- [${item.done ? 'x' : ' '}] ${item.title}${item.note ? ` — ${item.note}` : ''} (id ${item.id})`,
  )
  return [`${countOf(items.length, 'item')}, ${open} open.`, ...lines].join('\n')
}
