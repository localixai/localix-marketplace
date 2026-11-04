import { defineCollection } from '@localixai/mini-app-sdk/backend'
import { CARDS, cardInputSchema, cardSchema } from '../shared/model'

/**
 * The cards collection. `createMiniApp` turns this into the store, the routes
 * `/rpc/<app>/cards` (list, add, change, remove — each answering with the new list), the feed that
 * updates an open board the moment the agent writes, and the index that finds cards by meaning.
 */
export const cardsSpec = defineCollection({
  name: CARDS,
  item: cardSchema,
  input: cardInputSchema,
  // Defaults live here, not in the input schema: a change keeps every field it does not send.
  create: (input, { id, now }) => ({
    id,
    title: input.title,
    note: input.note ?? '',
    assignee: input.assignee ?? '',
    points: input.points ?? null,
    due: input.due ?? null,
    stage: input.stage ?? 'backlog',
    createdAt: now.toISOString(),
  }),
  // The board belongs to ONE CHAT: every chat has its own cards, and the host deletes them with the
  // chat. Reads and writes must name the chat: the routes take `?sessionId=`, a tool passes
  // `context.session.id`. `screenUi` and `useCollection` say `scope: 'chat'` too.
  scope: 'chat',
  limit: 500,
})
