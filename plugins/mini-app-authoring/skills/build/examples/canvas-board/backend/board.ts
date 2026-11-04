import type { Collection } from '@localixai/mini-app-sdk/backend'
import { arrange, freeSpot, type Arrangement } from '../shared/layout'
import {
  findLink,
  type Link,
  type LinkInput,
  type Look,
  type Note,
  type NoteInput,
} from '../shared/model'
import type { linksSpec, looksSpec, notesSpec } from './collections'

type Where = { userId: string; sessionId: string }
type Notes = Collection<Note, (typeof notesSpec)['input']['shape']>
type Links = Collection<Link, (typeof linksSpec)['input']['shape']>
type Looks = Collection<Look, (typeof looksSpec)['input']['shape']>

/**
 * THE BOARD'S OPERATIONS — what the agent's tools do, apart from how they are announced. Every
 * call names its chat (`where`): the collections are per chat, and the tool's context says which.
 * Keeping the rules here leaves `tools.ts` as wording and schemas only.
 */
export function createBoard(notes: Notes, links: Links, looks: Looks) {
  const read = async (where: Where) => ({
    notes: await notes.list(where),
    links: await links.list(where),
  })

  return {
    read,
    updateNote: (where: Where, id: string, patch: Partial<NoteInput>) =>
      notes.update(id, patch, where),
    disconnect: (where: Where, id: string) => links.remove(id, where),

    /** A note without a position goes to the next free slot, so a batch of adds does not stack. */
    async addNote(where: Where, input: NoteInput) {
      const placed =
        input.x === undefined || input.y === undefined
          ? { ...input, ...freeSpot(await notes.list(where)) }
          : input
      return notes.add(placed, where)
    },

    /**
     * An arrow between two notes that are on the board. A second connect between the same pair
     * changes the arrow's label instead of drawing a twin. `undefined` says a note is missing.
     */
    async connect(where: Where, input: LinkInput) {
      const [from, to] = await Promise.all([
        notes.get(input.from, where),
        notes.get(input.to, where),
      ])
      if (!from || !to) return undefined
      const existing = findLink(await links.list(where), input.from, input.to)
      if (existing) {
        const patch = {
          ...(input.label !== undefined && { label: input.label }),
          ...(input.tone && { tone: input.tone }),
        }
        return { link: (await links.update(existing.id, patch, where)) ?? existing, from, to }
      }
      return { link: await links.add(input, where), from, to }
    },

    /** A removed note takes its arrows with it. */
    async removeNote(where: Where, id: string) {
      if (!(await notes.remove(id, where))) return false
      for (const link of await links.list(where)) {
        if (link.from === id || link.to === id) await links.remove(link.id, where)
      }
      return true
    },

    /** Move every note to the places an arrangement gives; answers how many moved. */
    async arrange(where: Where, how: Arrangement) {
      const all = await read(where)
      const places = arrange(all.notes, all.links, how)
      for (const { id, x, y } of places) await notes.update(id, { x, y }, where)
      return places.length
    },

    /**
     * Point at notes: the open board pans to them. Only the newest request matters, so the old
     * ones go. Ids that are not on the board are reported back, not an error for the rest.
     */
    async look(where: Where, ids: readonly string[]) {
      const present = new Set((await notes.list(where)).map((note) => note.id))
      const found = ids.filter((id) => present.has(id))
      if (!found.length) return { found, missing: [...ids] }
      for (const old of await looks.list(where)) await looks.remove(old.id, where)
      await looks.add({ noteIds: found }, where)
      return { found, missing: ids.filter((id) => !present.has(id)) }
    },
  }
}

export type Board = ReturnType<typeof createBoard>
