import { z } from 'zod'
import { noteProblem, plainFront } from '../../shared/cloze'
import { countOf, snippet } from '../../shared/format'
import { LIMITS, noteInputSchema, notePatchSchema } from '../../shared/model'
import { invalid, notFound } from '../errors'
import { similarTo } from '../judge'
import { deckRef, idsHint, judgeFor, noteIdsFor, run, write, type ToolDeps } from './common'

/** Adding and changing notes: the agent's cards arrive as drafts by default. */

const SIMILAR_CHECKS = 50
const shape = noteInputSchema.shape

const deckField = z
  .string()
  .max(LIMITS.deckName)
  .optional()
  .describe('A deck id or name; a new name makes the deck; "inbox" for none. Ask the person when it is unclear.')

const cardInput = z.object({
  kind: shape.kind.describe(
    'basic (front → back, the default), reversed (asked both ways), cloze (the text in front with {{c1::answer}} or {{c1::answer::hint}} marks, one card per number; prefer it for definitions) or typed (the person types the back).',
  ),
  front: shape.front.describe('The question, or the cloze text. One fact per card; Markdown.'),
  back: shape.back.describe('The answer (required except for cloze). Short; Markdown.'),
  extra: shape.extra.describe('Shown after the answer: context, a mnemonic, the source.'),
  deck: deckField,
  tags: shape.tags.describe('Tags without #, lower-case, only ones the person would use.'),
})

export const addInput = z.object({
  cards: z.array(cardInput).min(1).max(LIMITS.addBatch).describe(`The notes to add, at most ${LIMITS.addBatch}.`),
  deck: deckField.describe('The deck for every note that names none (id or name; a new name makes it).'),
  draft: z
    .boolean()
    .optional()
    .describe('true (default): drafts the person accepts on the screen. false only when they asked for ready cards.'),
})

export function writeCardTools(deps: ToolDeps) {
  const { ctx, service } = deps
  return [
    ctx.defineTool({
      ...write,
      name: 'recall_add_cards',
      label: 'Add cards',
      activeVerb: 'Adding cards',
      description:
        'Add up to 200 notes, each making its cards. Answers with the new ids, the exact duplicates it skipped and the cards that look like ones already kept.',
      inputSchema: addInput,
      async execute(_id, input, _signal, _update, context) {
        return run(async () => {
          const problems = input.cards.flatMap((card, index) => {
            const problem = noteProblem(card.kind ?? 'basic', card.front, card.back ?? '')
            return problem ? [`#${index + 1} "${snippet(card.front, 40)}": ${problem}`] : []
          })
          if (problems.length) {
            throw invalid(`Nothing was added. Fix these and send again:\n${problems.join('\n')}`)
          }
          const status = input.draft === false ? 'active' : 'draft'
          const { added, skipped } = await service.addNotes(
            input.cards.map(({ deck, ...card }) => ({ ...card, ...deckRef(service, deck ?? input.deck) })),
            { source: 'agent', status, skipDuplicates: true },
          )
          const judge = judgeFor(deps, context?.session?.id)
          const looksLike: string[] = []
          for (const made of added.slice(0, SIMILAR_CHECKS)) {
            const { similar } = await similarTo(judge, made.note, made.note.id)
            const other = similar.find((hit) => !added.some((a) => a.note.id === hit.noteId))
            if (other) looksLike.push(`- "${snippet(plainFront(made.note), 50)}" (id ${made.note.id}) looks like "${other.front}" (id ${other.noteId})`)
          }
          const cards = added.reduce((sum, made) => sum + made.cards.length, 0)
          const lines = [
            added.length
              ? `Added ${countOf(added.length, 'note')} (${countOf(cards, 'card')}) as ${status === 'draft' ? 'drafts' : 'ready cards'}: ${added
                  .map((made) => made.note.id)
                  .join(', ')}.`
              : 'Added nothing new.',
          ]
          if (skipped.length) {
            lines.push(`Skipped ${countOf(skipped.length, 'exact duplicate')}: ${skipped.map((s) => `"${snippet(s.front, 40)}" (kept as ${s.existingId})`).join(', ')}.`)
          }
          if (looksLike.length) lines.push('Similar cards already kept (tell the person; nothing was removed):', ...looksLike)
          if (status === 'draft' && added.length) {
            lines.push('Next: offer to review the drafts on the Recall screen, or accept them with recall_review_drafts.')
          }
          return lines.join('\n')
        })
      },
    }),
    ctx.defineTool({
      ...write,
      name: 'recall_update_card',
      label: 'Change a card',
      activeVerb: 'Changing the card',
      description:
        'Change one note by its id: kind, front, back, extra, deck, tags (replaces them) or status. Fields left out stay. Cards whose variant still exists keep their progress.',
      inputSchema: notePatchSchema
        .omit({ deckId: true })
        .extend({
          id: z.string().min(1).describe('A note id (or one of its card ids).'),
          deck: deckField,
        }),
      async execute(_id, { id, deck, ...patch }) {
        return run(async () => {
          const [noteId] = noteIdsFor(service, [id]).found
          if (!noteId) throw notFound('card', idsHint)
          const target = deckRef(service, deck)
          let deckId = target.deckId
          if (target.deckName) deckId = (await service.saveDeck({ name: target.deckName })).deck.id
          const saved = await service.updateNote(noteId, { ...patch, ...(deckId !== undefined ? { deckId } : {}) })
          const changed = Object.keys({ ...patch, ...(deck !== undefined ? { deck } : {}) })
          return `Changed ${changed.join(', ') || 'nothing'} of "${snippet(plainFront(saved.note), 60)}" (id ${noteId}); it has ${countOf(saved.cards.length, 'card')}.`
        })
      },
    }),
  ]
}
