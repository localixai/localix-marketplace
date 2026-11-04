import { z } from 'zod'
import { methodSchema, type HttpRequest } from './http'

/**
 * THE MODEL — what the app keeps in a chat: the requests saved to it, from the agent's tool or from
 * a code block in the transcript. Shared by the backend, the tools and the screens, so the person
 * and the agent are always told the same thing.
 */

/** The mini app's name: its routes are `/rpc/<APP>/…`. */
export const APP = 'example-workspace'
/** The collection: its routes are `/rpc/<APP>/<REQUESTS>`. */
export const REQUESTS = 'requests'
/** The one @-mention provider: `localix://resource/request/<id>`. */
export const RESOURCE_PROVIDER = 'request'
/** The tool whose card the transcript draws (ui/register.tsx). */
export const SAVE_TOOL = 'example_workspace_save_request'

/**
 * What a person or the agent sends to save a request. No `.default()`: a partial update re-applies
 * a default and resets the field; defaults are filled where an item is made (backend/requests.ts).
 */
export const requestInputSchema = z.object({
  name: z.string().trim().min(1, 'Name the request.').max(120),
  method: methodSchema,
  url: z.string().trim().min(1, 'Give the URL.').max(2000),
  headers: z.array(z.string().trim().min(1).max(500)).max(30).optional(),
  body: z.string().max(20_000).optional(),
})

export const savedRequestSchema = z.object({
  id: z.string(),
  name: z.string(),
  method: methodSchema,
  url: z.string(),
  headers: z.array(z.string()),
  body: z.string(),
  /** ISO 8601, set when the request is saved. */
  createdAt: z.string(),
})

export type SavedRequest = z.infer<typeof savedRequestSchema>
export type RequestInput = z.input<typeof requestInputSchema>

/** A stored request as the plain request the format functions take. */
export const asRequest = ({ name, method, url, headers, body }: SavedRequest): HttpRequest => ({
  name,
  method,
  url,
  headers,
  body,
})

/** "1 request", "3 requests": counts read as words, never "1 requests". */
export const countOf = (count: number): string => `${count} ${count === 1 ? 'request' : 'requests'}`

/** Newest first: the one just saved is the one a person looks for. */
export const newestFirst = (requests: readonly SavedRequest[]): SavedRequest[] =>
  [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

/** What the agent is told: the count and every request with its id, so it can act on one. */
export function describeForAgent(requests: readonly SavedRequest[]): string {
  if (!requests.length) return 'No requests are saved in this chat.'
  const lines = newestFirst(requests).map(
    (request) => `- ${request.name}: ${request.method} ${request.url} (id ${request.id})`,
  )
  return [`${countOf(requests.length)} saved in this chat.`, ...lines].join('\n')
}
