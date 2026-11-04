import { z } from 'zod'
import { countOf } from '../../shared/format'
import { INBOX, LIMITS } from '../../shared/model'
import type { BulkRequest } from '../../shared/payloads'
import { invalid, notFound } from '../errors'
import { deckRef, findDeck, idsHint, noteIdsFor, remove, run, write, type ToolDeps } from './common'

/** Actions over many notes at once: move, tag, pause/resume/skip/reset, remove, drafts. */

const idsField = z
  .array(z.string().min(1))
  .min(1)
  .max(5000)
  .describe('Note ids (or card ids) from recall_find_cards. Only ones the person named or agreed to.')

const tagsField = z.array(z.string().trim().min(1).max(LIMITS.tag)).max(LIMITS.tags)

export function bulkCardTools(deps: ToolDeps) {
  const { ctx, service } = deps
  /** Resolve the ids, run one bulk action, and say what happened and what was not found. */
  const act = async (ids: readonly string[], request: Omit<BulkRequest, 'ids'>) => {
    const { found, unknown } = noteIdsFor(service, ids)
    if (!found.length) throw notFound('card', idsHint)
    const result = await service.bulk({ ...request, ids: found })
    return unknown.length ? `${result.message}\nNot found: ${unknown.join(', ')}.` : result.message
  }
  return [
    ctx.defineTool({
      ...write,
      name: 'recall_move_cards',
      label: 'Move cards',
      activeVerb: 'Moving cards',
      description: 'Move notes (with all their cards) to a deck, by id or name (a new name makes it), or to the Inbox.',
      inputSchema: z.object({
        ids: idsField,
        deck: z.string().min(1).max(LIMITS.deckName).describe('A deck id or name, or "inbox".'),
      }),
      async execute(_id, { ids, deck }) {
        return run(async () => {
          const target = deckRef(service, deck)
          let deckId = target.deckId ?? null
          let made = ''
          if (target.deckName) {
            const saved = await service.saveDeck({ name: target.deckName })
            deckId = saved.deck.id
            if (saved.created) made = `Made the deck "${saved.deck.name}". `
          }
          return made + (await act(ids, { action: 'move', deckId: deckId ?? INBOX }))
        })
      },
    }),
    ctx.defineTool({
      ...write,
      name: 'recall_tag_cards',
      label: 'Tag cards',
      activeVerb: 'Tagging cards',
      description: 'Add tags to notes, or remove tags from them. Other tags stay.',
      inputSchema: z.object({
        ids: idsField,
        add: tagsField.optional().describe('Tags to add, without #.'),
        remove: tagsField.optional().describe('Tags to remove, without #.'),
      }),
      async execute(_id, input) {
        return run(async () => {
          if (!input.add?.length && !input.remove?.length) throw invalid('Name tags to add or remove.')
          const lines: string[] = []
          if (input.add?.length) lines.push(await act(input.ids, { action: 'tag-add', tags: input.add }))
          if (input.remove?.length) lines.push(await act(input.ids, { action: 'tag-remove', tags: input.remove }))
          return lines.join('\n')
        })
      },
    }),
    ctx.defineTool({
      ...write,
      name: 'recall_set_state',
      label: 'Pause, resume, skip or reset cards',
      activeVerb: 'Updating cards',
      description:
        'pause (out of study until resumed), resume, skip-until-tomorrow, or reset-progress (back to new; their answer history is cleared) for every card of these notes.',
      inputSchema: z.object({
        ids: idsField,
        state: z.enum(['pause', 'resume', 'skip-until-tomorrow', 'reset-progress']),
      }),
      async execute(_id, { ids, state }) {
        const action = ({ pause: 'pause', resume: 'resume', 'skip-until-tomorrow': 'skip', 'reset-progress': 'reset' } as const)[state]
        return run(() => act(ids, { action }))
      },
    }),
    ctx.defineTool({
      ...remove,
      name: 'recall_remove_cards',
      label: 'Delete cards',
      activeVerb: 'Deleting cards',
      description: 'Delete notes with all their cards and answer history. Only notes the person named.',
      inputSchema: z.object({ ids: idsField }),
      async execute(_id, { ids }) {
        return run(() => act(ids, { action: 'delete' }))
      },
    }),
    ctx.defineTool({
      ...write,
      name: 'recall_review_drafts',
      label: 'Accept or discard drafts',
      activeVerb: 'Reviewing drafts',
      description:
        'Accept drafts (they become cards to study) or discard them: by ids, or every draft of a deck, or every draft when neither is given.',
      inputSchema: z.object({
        action: z.enum(['accept', 'discard']),
        ids: idsField.optional(),
        deck: z.string().optional().describe('Every draft in this deck (id or name, or "inbox").'),
      }),
      classify: (input: unknown) =>
        (input as { action?: string })?.action === 'discard'
          ? { effect: 'host' as const, irreversible: true }
          : { effect: 'host' as const },
      async execute(_id, input) {
        return run(async () => {
          let deckId: string | undefined
          if (input.deck) {
            if (input.deck.trim().toLowerCase() === INBOX) deckId = INBOX
            else {
              const deck = findDeck(service, input.deck)
              if (!deck) throw notFound('deck', 'Read recall_list_decks for the decks.')
              deckId = deck.id
            }
          }
          const ids = input.ids ? noteIdsFor(service, input.ids).found : undefined
          if (input.ids && !ids?.length) throw notFound('draft', idsHint)
          const result = await service.drafts({ action: input.action, ids, deckId })
          const left = service.today().drafts
          return `${result.message} ${countOf(left, 'draft')} left.`
        })
      },
    }),
  ]
}
