import type {
  AgentToolExecutionContext,
  Collection,
  MiniAppContext,
} from '@localixai/mini-app-sdk/backend'
import { STAGES, STAGE_LABEL, cardInputSchema, describeForAgent, type Card } from '../shared/model'
import type { cardsSpec } from './cards'

type Cards = Collection<Card, (typeof cardsSpec)['input']['shape']>

/**
 * The agent's tools. Every one acts on the board of the chat that called it: a chat collection is
 * addressed by `{ sessionId }`, which the host hands each call in `context.session`. A tool never
 * remembers a chat itself (no module variable): `register` runs more than once.
 *
 * Rules every tool here keeps:
 * - Writes are `sequential`, `mutates: true`, and classified `host` (the app's own data).
 * - `isError: true` only for a call that did nothing because the input was wrong.
 * - The answer says what changed and shows the whole board, so the agent can tell the person in
 *   one sentence.
 */
export function createTools(ctx: MiniAppContext, cards: Cards) {
  const { z } = ctx
  const write = {
    executionMode: 'sequential',
    mutates: true,
    classify: () => ({ effect: 'host' as const }),
    permissionPaths: () => [],
  } as const
  const read = { executionMode: 'parallel', mutates: false, permissionPaths: () => [] } as const

  /** The chat's id, or the sentence that tells the agent there is no board to act on. */
  const chatOf = (context: AgentToolExecutionContext | undefined) => context?.session?.id ?? null
  const noChat = { content: 'The board lives in a chat; there is none here.', isError: true }
  const unknownCard = {
    content: 'No card has that id. Read example_board_show for the ids.',
    isError: true,
  }
  const board = async (sessionId: string) => describeForAgent(await cards.list({ sessionId }))

  return [
    ctx.defineTool({
      ...read,
      name: 'example_board_show',
      label: 'Show the board',
      activeVerb: 'Reading the board',
      description: "Read the chat's board: every column with its cards, their ids and the totals.",
      inputSchema: z.object({}),
      async execute(_toolCallId, _input, _signal, _onUpdate, context) {
        const sessionId = chatOf(context)
        if (!sessionId) return noChat
        return { content: await board(sessionId) }
      },
    }),
    ctx.defineTool({
      ...write,
      name: 'example_board_add_card',
      label: 'Add a card',
      activeVerb: 'Adding a card',
      description:
        "Add one card to the chat's board; it starts in the Backlog unless a stage is given. Answers with the whole board.",
      // The shared schema with descriptions added: the agent is shown the limits the board keeps.
      inputSchema: cardInputSchema.extend({
        title: cardInputSchema.shape.title.describe('What the work is, in a few words.'),
        points: cardInputSchema.shape.points.describe('Effort estimate, a whole number of points.'),
        due: cardInputSchema.shape.due.describe('The day it is due, YYYY-MM-DD.'),
      }),
      async execute(_toolCallId, input, _signal, _onUpdate, context) {
        const sessionId = chatOf(context)
        if (!sessionId) return noChat
        const card = await cards.add(input, { sessionId })
        return {
          content: `Added "${card.title}" to ${STAGE_LABEL[card.stage]}.\n${await board(sessionId)}`,
        }
      },
    }),
    ctx.defineTool({
      ...write,
      name: 'example_board_move_card',
      label: 'Move a card',
      activeVerb: 'Moving a card',
      description:
        'Move one card to a stage by its id. An open board shows the card slide across at once. Answers with the whole board.',
      inputSchema: z.object({
        id: z.string().min(1).describe("The card's id, from example_board_show."),
        stage: z.enum(STAGES),
      }),
      async execute(_toolCallId, { id, stage }, _signal, _onUpdate, context) {
        const sessionId = chatOf(context)
        if (!sessionId) return noChat
        const card = await cards.get(id, { sessionId })
        if (!card) return unknownCard
        // Already there is not a mistake, and nothing needs writing: say so and show the board.
        if (card.stage === stage) {
          return { content: `"${card.title}" is already in ${STAGE_LABEL[stage]}.` }
        }
        await cards.update(id, { stage }, { sessionId })
        return {
          content: `Moved "${card.title}" from ${STAGE_LABEL[card.stage]} to ${STAGE_LABEL[stage]}.\n${await board(sessionId)}`,
        }
      },
    }),
  ]
}
