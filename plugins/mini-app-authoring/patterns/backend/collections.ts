import { defineCollection } from '@localixai/mini-app-sdk/backend'
import {
  ACTIVITIES,
  DEALS,
  activityInputSchema,
  activitySchema,
  dealInputSchema,
  dealSchema,
} from '../shared/model'

/**
 * The two collections. `createMiniApp` turns each spec into a store under the app's data folder
 * and the routes `/rpc/<app>/deals` and `/rpc/<app>/activities` (list, add, change, remove — each
 * answering with the new list), and keeps an open screen current when anything writes.
 *
 * Defaults live in `create`, never as `.default()` on the input schema: a partial update would
 * apply a schema default again and reset the field.
 */
export const dealsSpec = defineCollection({
  name: DEALS,
  item: dealSchema,
  input: dealInputSchema,
  create: (input, { id, now }) => ({
    ...input,
    id,
    currency: input.currency ?? 'USD',
    stage: input.stage ?? 'lead',
    createdAt: new Date(input.createdAt ?? now).toISOString(),
  }),
  scope: 'app',
  limit: 5000,
})

export const activitiesSpec = defineCollection({
  name: ACTIVITIES,
  item: activitySchema,
  input: activityInputSchema,
  create: (input, { id, now }) => ({ ...input, id, at: new Date(input.at ?? now).toISOString() }),
  scope: 'app',
  limit: 20000,
})
