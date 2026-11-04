import { Hono } from 'hono'
import {
  createMiniApp,
  type MiniAppContext,
  type MiniAppRegistration,
  type MiniAppRouteContext,
} from '@localixai/mini-app-sdk/backend'
import { summarize } from '../shared/model'
import { expensesSpec } from './expenses'
import { createTools } from './tools'

/**
 * The backend: one collection, one derived read route and the agent's tools.
 *
 * `/summary` is a custom route: the numbers are computed on the server by `summarize`, the same
 * function the report tool calls, so the browser never recomputes them from every row. It is
 * mounted under `/rpc/<app>` next to the collection's own routes.
 *
 * `register(ctx)` runs more than once (for the backend, and again for each run's tools): keep
 * state in collections, never in a module variable.
 */
export function register(ctx: MiniAppContext): MiniAppRegistration {
  const app = createMiniApp(ctx)
  const expenses = app.collection(expensesSpec)
  const routes = new Hono<MiniAppRouteContext>().get('/summary', async (c) =>
    c.json(summarize(await expenses.list(), new Date())),
  )
  return app.registration({ routes, tools: createTools(ctx, expenses) })
}
