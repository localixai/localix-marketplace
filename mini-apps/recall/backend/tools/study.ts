import { z } from 'zod'
import { describeStudyCard } from '../../shared/describe'
import { countOf, formatMoment } from '../../shared/format'
import { INBOX, RATING_NAMES, ratingSchema, type CardFilter } from '../../shared/model'
import { notFound } from '../errors'
import { findDeck, run, write, read, type ToolDeps } from './common'

/** Quizzing in the chat: the next card, and a grade that counts like the screen's. */

const filterInput = {
  deck: z.string().optional().describe('Only this deck (id or name, or "inbox").'),
  tag: z.string().optional().describe('Only cards with this tag (no #).'),
}

export function studyTools(deps: ToolDeps) {
  const { ctx, service } = deps
  const filterOf = (input: { deck?: string; tag?: string }): CardFilter => {
    const filter: CardFilter = {}
    if (input.deck) {
      if (input.deck.trim().toLowerCase() === INBOX) filter.deckIds = [INBOX]
      else {
        const deck = findDeck(service, input.deck)
        if (!deck) throw notFound('deck', 'Read recall_list_decks for the decks.')
        filter.deckIds = [deck.id]
      }
    }
    if (input.tag) filter.tags = [input.tag.replace(/^#/, '').toLowerCase()]
    return filter
  }
  const nothingLeft = (nextDueAt: string | null) => {
    const now = service.core.clock.now()
    const when = nextDueAt ? ` The next card is due ${formatMoment(nextDueAt, now, service.core.clock.utcOffset(now))}.` : ''
    return `Nothing to study now.${when}`
  }
  return [
    ctx.defineTool({
      ...read,
      name: 'recall_next_card',
      label: 'Next card',
      activeVerb: 'Picking a card',
      description:
        'The next card to study, as the screen would show it: what to ask, the answer to check against, the extra, and how many are left. Optionally one deck or tag.',
      inputSchema: z.object(filterInput),
      async execute(_id, input) {
        return run(() => {
          const next = service.studyNext(filterOf(input))
          return next.card ? describeStudyCard(next.card, next) : nothingLeft(next.nextDueAt)
        })
      },
    }),
    ctx.defineTool({
      ...write,
      name: 'recall_grade_card',
      label: 'Grade a card',
      activeVerb: 'Grading',
      description:
        'Record the person\'s answer to a card from recall_next_card: 1 Again (forgot), 2 Hard, 3 Good, 4 Easy. Counts like an answer on the screen. Answers with when it comes back and what is left.',
      inputSchema: z.object({
        cardId: z.string().min(1).describe('The card id recall_next_card gave.'),
        rating: ratingSchema.describe('1 Again, 2 Hard, 3 Good, 4 Easy. Use 1 or 3 unless the person said hard or easy.'),
        ...filterInput,
      }),
      behaviorHints: { idempotentHint: false },
      async execute(_id, { cardId, rating, ...filter }) {
        return run(async () => {
          const result = await service.gradeCard({ cardId, rating, source: 'chat', filter: filterOf(filter) })
          const lines = [`Graded ${RATING_NAMES[rating]}: it comes back in ${result.label}.`]
          if (result.becameHard) {
            lines.push('That was its 8th lapse: it is now a hard card. Offer to rewrite it (clearer question, one fact) or pause it.')
          }
          lines.push(
            result.next.counts.total
              ? `${countOf(result.next.counts.total, 'card')} left now. Call recall_next_card for the next one.`
              : nothingLeft(result.next.nextDueAt),
          )
          return lines.join('\n')
        })
      },
    }),
  ]
}
