import type { Context } from 'hono'
import type { z } from 'zod'
import { jsonError, routeValidator, type MiniAppContext, type MiniAppRouteContext } from '@localixai/mini-app-sdk/backend'
import { fromQuery } from '../shared/api'
import { isImportError, RecallError } from './errors'
import type { JudgeDeps } from './judge'
import type { Service } from './service'

/** What every route file shares: the validator, the error mapping, query parsing, judge deps. */

export type RouteContext = Context<MiniAppRouteContext>

export const validated = routeValidator()

export interface RouteDeps {
  service: Service
  ctx: Pick<MiniAppContext, 'decisions' | 'host' | 'userId'>
}

/** Run a handler; a domain error answers its status and sentence, nothing else is swallowed. */
export async function answer(c: RouteContext, run: () => unknown): Promise<Response> {
  try {
    const result = await run()
    return result instanceof Response ? result : c.json(result as object)
  } catch (error) {
    if (error instanceof RecallError) return jsonError(c, error.status, error.code, error.message)
    if (isImportError(error)) return jsonError(c, 422, 'unreadable_file', error.message)
    throw error
  }
}

/** Parse a GET's query by its schema in `shared/api.ts`, or answer 400. */
export function queryOf<S extends z.ZodObject>(
  c: RouteContext,
  schema: S,
): { ok: true; value: z.infer<S> } | { ok: false; response: Response } {
  const parsed = fromQuery(schema, new URL(c.req.url).searchParams)
  if (parsed.success) return { ok: true, value: parsed.data }
  const message = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'query'}: ${issue.message}`).join('; ')
  return { ok: false, response: jsonError(c, 400, 'invalid_query', message) }
}

export function judgeDeps(deps: RouteDeps, c: RouteContext): JudgeDeps {
  return { core: deps.service.core, ctx: deps.ctx, sessionId: c.env?.sessionId }
}
