import { z } from 'zod'

/**
 * THE MODEL — what the board keeps, shared by the backend, the agent's tools and the screen.
 *
 * Three chat-scoped collections, one per kind of thing a board holds:
 *  - notes: the cards, each with a position the person drags;
 *  - links: arrows between two notes, by note id;
 *  - looks: the agent's "look at this" requests, which the open board turns into a camera move.
 *
 * Pure functions only (no storage, network or React), so the rules are tested in milliseconds and
 * the screen and the tools describe the board with the same words.
 */

export const APP = 'canvas-board'
export const NOTES = 'notes'
export const LINKS = 'links'
export const LOOKS = 'looks'

/** A note's tone is the only colour choice a person makes; it maps to a host status token. */
export const TONES = ['neutral', 'info', 'warning'] as const
export type Tone = (typeof TONES)[number]

/**
 * No `.default()` anywhere in an input schema: a partial update (`{ x, y }` after a drag) is
 * validated by the same schema, and a default would put the other fields back. Defaults live in
 * each collection's `create` (backend/collections.ts).
 */
export const noteInputSchema = z.object({
  text: z.string().trim().min(1, 'Write something on the note.').max(500),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  tone: z.enum(TONES).optional(),
})
export const noteSchema = z.object({
  id: z.string(),
  text: z.string(),
  x: z.number(),
  y: z.number(),
  tone: z.enum(TONES),
})
export type Note = z.infer<typeof noteSchema>
export type NoteInput = z.input<typeof noteInputSchema>

export const linkInputSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().trim().max(60).optional(),
  tone: z.enum(TONES).optional(),
})
export const linkSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  label: z.string(),
  tone: z.enum(TONES),
})
export type Link = z.infer<typeof linkSchema>
export type LinkInput = z.input<typeof linkInputSchema>

/** The agent pointing at notes. `at` (ISO 8601) is when, so a stale request is never replayed. */
export const lookInputSchema = z.object({ noteIds: z.array(z.string().min(1)).min(1).max(50) })
export const lookSchema = z.object({
  id: z.string(),
  noteIds: z.array(z.string()),
  at: z.string(),
})
export type Look = z.infer<typeof lookSchema>
export type LookInput = z.input<typeof lookInputSchema>

/** A look older than this is not applied: the person has had time to look elsewhere. */
export const LOOK_TTL_MS = 15_000

/** "1 note", "3 notes": counts read as words, never "1 notes". */
export function countOf(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`
}

/** A link whose notes are both still on the board. A removed note leaves no dangling arrow. */
export function liveLinks(notes: readonly Note[], links: readonly Link[]): Link[] {
  const ids = new Set(notes.map((note) => note.id))
  return links.filter((link) => ids.has(link.from) && ids.has(link.to))
}

/** The link between two notes in that direction, if there is one. */
export function findLink(links: readonly Link[], from: string, to: string): Link | undefined {
  return links.find((link) => link.from === from && link.to === to)
}

const short = (text: string) => (text.length > 40 ? `${text.slice(0, 39)}…` : text)

/**
 * What the agent is told: every note with its id, tone and position, then every link by the notes'
 * words and ids. The screen publishes this same text as message context, so "what is on my board"
 * is answered from what the person sees.
 */
export function describeBoard(notes: readonly Note[], links: readonly Link[]): string {
  if (!notes.length) return 'The board is empty.'
  const shown = liveLinks(notes, links)
  const byId = new Map(notes.map((note) => [note.id, note]))
  const lines = notes.map(
    (note) =>
      `- ${short(note.text)} (id ${note.id}, ${note.tone}, at ${Math.round(note.x)},${Math.round(note.y)})`,
  )
  const arrows = shown.map((link) => {
    const label = link.label ? ` [${link.label}]` : ''
    return `- ${short(byId.get(link.from)!.text)} -> ${short(byId.get(link.to)!.text)}${label} (id ${link.id})`
  })
  return [
    `${countOf(notes.length, 'note')}, ${countOf(shown.length, 'link')}.`,
    'Notes:',
    ...lines,
    ...(arrows.length ? ['Links:', ...arrows] : []),
  ].join('\n')
}
