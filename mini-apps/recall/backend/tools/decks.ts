import { z } from 'zod'
import { describeDecks, describeOverview, describeSettings, describeStats } from '../../shared/describe'
import { countOf, formatPercent } from '../../shared/format'
import { deckInputSchema, settingsPatchSchema } from '../../shared/model'
import { invalid, notFound } from '../errors'
import { findDeck, idsHint, noteIdsFor, read, remove, run, write, type ToolDeps } from './common'

/** The overview, decks, stats and settings. */

export function deckTools(deps: ToolDeps) {
  const { ctx, service } = deps
  const decksText = () => {
    const { decks, inbox } = service.decks()
    return describeDecks(decks, inbox)
  }
  return [
    ctx.defineTool({
      ...read,
      name: 'recall_overview',
      label: 'Recall overview',
      activeVerb: 'Reading Recall',
      description:
        'Where the collection stands: what is due now and how long it takes, decks with their due counts, drafts, the Inbox, the daily goal, the streak and retention. Call it first.',
      inputSchema: z.object({}),
      async execute() {
        return run(() => {
          const now = service.core.clock.now()
          const stats = service.stats({ days: 7 })
          return describeOverview(service.today(), stats.retention, now, service.core.clock.utcOffset(now))
        })
      },
    }),
    ctx.defineTool({
      ...read,
      name: 'recall_list_decks',
      label: 'List decks',
      activeVerb: 'Reading decks',
      description: 'Every deck with its id, note count and what is to study today, and the Inbox.',
      inputSchema: z.object({}),
      async execute() {
        return run(decksText)
      },
    }),
    ctx.defineTool({
      ...write,
      name: 'recall_save_deck',
      label: 'Save a deck',
      activeVerb: 'Saving the deck',
      description: 'Create a deck, or change one found by id (or by its name when no id is given): name, description, colour 1–6.',
      inputSchema: deckInputSchema.extend({
        id: z.string().optional().describe('The deck to change; leave out to create or to find it by name.'),
        name: deckInputSchema.shape.name.describe('The deck name, as the person says it.'),
        description: deckInputSchema.shape.description.describe('What the deck is for, in a sentence.'),
        color: deckInputSchema.shape.color.describe('A colour slot from 1 to 6.'),
      }),
      async execute(_id, input) {
        return run(async () => {
          const { deck, created } = await service.saveDeck(input)
          return `${created ? 'Made' : 'Changed'} the deck "${deck.name}" (id ${deck.id}).\n${decksText()}`
        })
      },
    }),
    ctx.defineTool({
      ...remove,
      name: 'recall_remove_deck',
      label: 'Remove a deck',
      activeVerb: 'Removing the deck',
      description:
        'Remove a deck. Its cards move to the Inbox ("inbox") or are deleted with their history ("delete"): ask the person which.',
      inputSchema: z.object({
        deck: z.string().min(1).describe('The deck id or name.'),
        cards: z.enum(['inbox', 'delete']).describe('What happens to its cards.'),
      }),
      async execute(_id, input) {
        return run(async () => {
          const deck = findDeck(service, input.deck)
          if (!deck) throw notFound('deck', 'Read recall_list_decks for the decks.')
          const result = await service.removeDeck(deck.id, input.cards)
          const fate = input.cards === 'inbox' ? `moved ${countOf(result.moved, 'note')} to the Inbox` : `deleted ${countOf(result.deleted, 'note')}`
          return `Removed the deck "${result.removed}" and ${fate}.\n${decksText()}`
        })
      },
    }),
    ctx.defineTool({
      ...read,
      name: 'recall_stats',
      label: 'Study stats',
      activeVerb: 'Reading stats',
      description:
        'Numbers for the whole collection, one deck, or one card: states, due forecast for N days, reviews and time, retention against the target, hardest cards.',
      inputSchema: z.object({
        deck: z.string().optional().describe('A deck id or name; leave out for everything.'),
        card: z.string().optional().describe('A note or card id: its own history instead.'),
        days: z.number().int().min(7).max(365).optional().describe('Forecast days (default 30).'),
      }),
      async execute(_id, input) {
        return run(async () => {
          if (input.card) {
            const [noteId] = noteIdsFor(service, [input.card]).found
            if (!noteId) throw notFound('card', idsHint)
            const detail = service.noteDetail(noteId)
            const answers = detail.history.length
            const right = detail.history.filter((r) => r.rating > 1).length
            return `${countOf(answers, 'answer')}, ${answers ? formatPercent(right / answers) : '—'} remembered. ${detail.cards
              .map((c) => `${c.variant}: ${c.lapses} lapses, recall now ${formatPercent(c.retrievability)}`)
              .join('; ')}.`
          }
          let deckIds: string[] | undefined
          if (input.deck) {
            const deck = findDeck(service, input.deck)
            if (!deck) throw notFound('deck', 'Read recall_list_decks for the decks.')
            deckIds = [deck.id]
          }
          const forecast = service.stats({ deckIds, days: input.days })
          const days = forecast.forecast.map((d) => d.count)
          return `${describeStats(forecast)}\nForecast for ${days.length} days: ${days.join(' ')}.`
        })
      },
    }),
    ctx.defineTool({
      ...write,
      name: 'recall_settings',
      label: 'Recall settings',
      activeVerb: 'Reading settings',
      description:
        'Read the settings, or change the ones given: retention 0.8/0.9/0.95, newPerDay, buttons two|four, dayStartsAt (hour), dailyGoal, typedAnswerCheck, suggestPlacement, autoplaySounds. Change only what the person asked for.',
      inputSchema: settingsPatchSchema.extend({
        retention: settingsPatchSchema.shape.retention.describe('How much to remember: 0.8, 0.9 (default) or 0.95. Higher means more reviews.'),
        newPerDay: settingsPatchSchema.shape.newPerDay.describe('New cards a day (default 20).'),
        dayStartsAt: settingsPatchSchema.shape.dayStartsAt.describe('The hour a study day starts, local (default 4).'),
      }),
      classify: (input: unknown) =>
        input && typeof input === 'object' && Object.keys(input).length ? { effect: 'host' as const } : { effect: 'read' as const },
      async execute(_id, input) {
        return run(async () => {
          const keys = Object.keys(input).filter((key) => (input as Record<string, unknown>)[key] !== undefined)
          if (keys.length) await service.updateSettings(input)
          else if (Object.keys(input).length) throw invalid('Name a setting to change, or send nothing to read them.')
          const head = keys.length ? `Changed ${keys.join(', ')}.\n` : ''
          return head + describeSettings(service.settings())
        })
      },
    }),
  ]
}
