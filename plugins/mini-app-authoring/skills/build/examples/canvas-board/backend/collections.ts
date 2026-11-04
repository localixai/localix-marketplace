import { defineCollection } from '@localixai/mini-app-sdk/backend'
import {
  LINKS,
  LOOKS,
  NOTES,
  linkInputSchema,
  linkSchema,
  lookInputSchema,
  lookSchema,
  noteInputSchema,
  noteSchema,
} from '../shared/model'

/**
 * The board's three collections. `scope: 'chat'` keeps one set per chat: the board is the chat's,
 * lives under the chat's own folder and goes when the chat does. Each becomes routes under
 * `/rpc/canvas-board/<name>`, and a write to any of them — from the screen or from a tool — nudges
 * the open board, so the agent's edit appears while the person watches.
 *
 * Defaults are filled in `create`, never in the input schemas (see shared/model.ts).
 */
export const notesSpec = defineCollection({
  name: NOTES,
  item: noteSchema,
  input: noteInputSchema,
  // A position is almost always given (the screen sends where the person double-clicked, the tool
  // sends the next free slot); the origin is only the fallback for a route called without one.
  create: (input, { id }) => ({
    id,
    text: input.text,
    x: input.x ?? 0,
    y: input.y ?? 0,
    tone: input.tone ?? 'neutral',
  }),
  scope: 'chat',
  limit: 200,
})

export const linksSpec = defineCollection({
  name: LINKS,
  item: linkSchema,
  input: linkInputSchema,
  create: (input, { id }) => ({
    id,
    from: input.from,
    to: input.to,
    label: input.label ?? '',
    tone: input.tone ?? 'neutral',
  }),
  scope: 'chat',
  limit: 600,
})

/** Looks are requests, not content: a handful is plenty, and the board only reads the newest. */
export const looksSpec = defineCollection({
  name: LOOKS,
  item: lookSchema,
  input: lookInputSchema,
  create: (input, { id, now }) => ({ id, noteIds: input.noteIds, at: now.toISOString() }),
  scope: 'chat',
  limit: 10,
})
