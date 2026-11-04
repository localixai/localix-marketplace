import { z } from 'zod'
import { describeDetail, describePage } from '../../shared/describe'
import { INBOX, libraryStateSchema, librarySortSchema, noteKindSchema, noteStatusSchema } from '../../shared/model'
import { notFound } from '../errors'
import { rankNotes } from '../judge'
import { findDeck, idsHint, judgeFor, noteIdsFor, read, run, type ToolDeps } from './common'

/** Finding cards and reading one: ids, short text, state and next due. */

export const findInput = z.object({
  query: z.string().trim().max(500).optional().describe('Words to find in the front, back, extra or tags; or a meaning with mode "meaning".'),
  mode: z.enum(['text', 'meaning']).optional().describe('"text" (default) matches words; "meaning" ranks by meaning when the embedding model is ready.'),
  deck: z.string().optional().describe('A deck id or name, or "inbox" for cards without a deck.'),
  tag: z.string().optional().describe('Only notes with this tag (no #).'),
  state: libraryStateSchema.optional().describe('new, learning, review, paused, hard (a card lapsed 8 times) or draft.'),
  kind: noteKindSchema.optional(),
  status: noteStatusSchema.optional().describe('draft or active.'),
  sort: librarySortSchema.optional().describe('newest (default), oldest, updated, due, hardest or alpha.'),
  offset: z.number().int().min(0).optional().describe('Skip this many, for the next page.'),
  limit: z.number().int().min(1).max(100).optional().describe('At most this many (default 30).'),
})

export function readCardTools(deps: ToolDeps) {
  const { ctx, service } = deps
  return [
    ctx.defineTool({
      ...read,
      name: 'recall_find_cards',
      label: 'Find cards',
      activeVerb: 'Searching cards',
      description:
        'Find notes (each makes one or more cards) by words or meaning and filters: deck, tag, state, kind, status. Answers with ids, short text, deck, tags, state and next due, a page at a time with the total.',
      inputSchema: findInput,
      async execute(_id, input, _signal, _update, context) {
        return run(async () => {
          let deckIds: string[] | undefined
          if (input.deck) {
            if (input.deck.trim().toLowerCase() === INBOX) deckIds = [INBOX]
            else {
              const deck = findDeck(service, input.deck)
              if (!deck) return `No deck is called "${input.deck}". Read recall_list_decks for the decks.`
              deckIds = [deck.id]
            }
          }
          const query = {
            q: input.query,
            mode: input.mode,
            deckIds,
            tags: input.tag ? [input.tag.replace(/^#/, '').toLowerCase()] : undefined,
            states: input.state ? [input.state] : undefined,
            kinds: input.kind ? [input.kind] : undefined,
            status: input.status,
            sort: input.sort,
            offset: input.offset,
            limit: input.limit ?? 30,
          }
          let note = ''
          let ranked: string[] | undefined
          if (input.query && input.mode === 'meaning') {
            ranked = (await rankNotes(judgeFor(deps, context?.session?.id), input.query)) ?? undefined
            if (!ranked) note = 'Meaning search is not ready here; matched by words instead.\n'
          }
          return note + describePage(service.library(query, ranked), service.core.clock.now())
        })
      },
    }),
    ctx.defineTool({
      ...read,
      name: 'recall_get_card',
      label: 'Read a card',
      activeVerb: 'Reading the card',
      description:
        'Read one note by its id (or one of its card ids): its text, deck, tags, each card with its state, reviews, lapses and next due, and its latest answers.',
      inputSchema: z.object({ id: z.string().min(1).describe('A note id or card id from recall_find_cards.') }),
      async execute(_id, { id }) {
        return run(() => {
          const [noteId] = noteIdsFor(service, [id]).found
          if (!noteId) throw notFound('card', idsHint)
          return describeDetail(service.noteDetail(noteId), service.core.clock.now())
        })
      },
    }),
  ]
}
