import { defineCollection } from '@localixai/mini-app-sdk/backend'
import { REQUESTS, requestInputSchema, savedRequestSchema } from '../shared/model'

/**
 * The saved requests. `scope: 'chat'` keeps one list per chat, stored in the chat's own folder and
 * deleted with it: the routes then need `?sessionId=`, and a tool reaches its own chat's list with
 * `{ sessionId: context.session.id }`.
 */
export const requestsSpec = defineCollection({
  name: REQUESTS,
  item: savedRequestSchema,
  input: requestInputSchema,
  // Defaults live here, not in the input schema: a change keeps every field it does not send.
  create: (input, { id, now }) => ({
    id,
    name: input.name,
    method: input.method,
    url: input.url,
    headers: input.headers ?? [],
    body: input.body ?? '',
    createdAt: now.toISOString(),
  }),
  scope: 'chat',
  limit: 500,
})
