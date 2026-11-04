import { defineCollection } from '@localixai/mini-app-sdk/backend'
import { ITEMS, itemInputSchema, itemSchema } from '../shared/model'

/**
 * The items collection: where they are kept and how one is made. `createMiniApp` turns this into
 * the store under the app's data folder, the routes `/rpc/<app>/items` (list, add, change, remove —
 * each answering with the new list), the feed that updates an open screen the moment the agent
 * writes, and the index that finds items by meaning.
 */
export const itemsSpec = defineCollection({
  name: ITEMS,
  item: itemSchema,
  input: itemInputSchema,
  // Defaults live here, not in the input schema: a change keeps every field it does not send.
  create: (input, { id, now }) => ({
    id,
    title: input.title,
    note: input.note ?? '',
    done: input.done ?? false,
    createdAt: now.toISOString(),
  }),
  // One list for the whole app. `scope: 'chat'` keeps one per chat instead (a game, a board).
  scope: 'app',
  limit: 5000,
  // What the embedding model reads to find an item by meaning (`template_find_items`).
  search: (item) => [item.title, item.note].filter(Boolean).join(' — '),
})
